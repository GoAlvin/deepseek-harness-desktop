/** Supervised DeepSeek Harness Web child process for the Electron host. */

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

/** Maximum time allowed for the Web profile to publish its local URL. */
export const BACKEND_START_TIMEOUT_MS = 45_000

/** Maximum time allowed for graceful profile disposal before forced termination. */
export const BACKEND_STOP_TIMEOUT_MS = 7_000

const MAX_DIAGNOSTIC_CHARS = 24_000
const READY_LINE = /(?:^|\r?\n)dsh web: (http:\/\/127\.0\.0\.1:\d+)(?=\s)/u
const SHUTDOWN_MESSAGE = { type: 'dsh:parent-shutdown' } as const
// Wire values mirror directory-picker-native's backend half. Keeping this
// desktop boundary local prevents the GUI typecheck from compiling package
// source outside its rootDir; protocol tests on both sides pin the values.
const DESKTOP_PARENT_PICKER_ENV = 'DSH_DESKTOP_PARENT_PICKER'
const DESKTOP_PICK_REQUEST = 'dsh:desktop-pick-directory'
const DESKTOP_PICK_RESPONSE = 'dsh:desktop-pick-directory-result'

interface DesktopDirectoryPickerRequest {
  type: typeof DESKTOP_PICK_REQUEST
  requestId: string
  title: string
}

interface DesktopDirectoryPickerResponse {
  type: typeof DESKTOP_PICK_RESPONSE
  requestId: string
  result: { ok: true; path: string | null } | { ok: false; error: string }
}

function isDesktopDirectoryPickerRequest(message: unknown): message is DesktopDirectoryPickerRequest {
  if (typeof message !== 'object' || message === null) return false
  const record = message as Record<string, unknown>
  return record.type === DESKTOP_PICK_REQUEST
    && typeof record.requestId === 'string'
    && record.requestId !== ''
    && typeof record.title === 'string'
    && record.title !== ''
}

/** Independent facts reported when the backend process closes. */
export interface BackendExit {
  /** Numeric process exit code, or `null` when termination reported only a signal. */
  exitCode: number | null
  /** Terminating signal, or `null` when the process returned an exit code. */
  signalCode: NodeJS.Signals | null
}

/** Live backend owned by the desktop application. */
export interface HarnessBackend {
  /** Loopback URL serving the Harness application. */
  url: URL
  /** Complete process outcome, including unexpected exits. */
  closed: Promise<BackendExit>
  /** Request graceful tree disposal and wait until the child reaches quiescence. */
  stop(): Promise<void>
}

/** Inputs required to start the desktop-owned Web profile. */
export interface StartBackendOptions {
  /** Electron executable, relaunched with `ELECTRON_RUN_AS_NODE`. */
  executable: string
  /** Initial filesystem location for the Harness process. */
  cwd: string
  /** Desktop-specific Harness home containing profiles, credentials, and sessions. */
  harnessHome: string
  /** Environment inherited by the backend before desktop-owned values are applied. */
  environment?: NodeJS.ProcessEnv
  /** Observer for bounded startup and runtime diagnostics. */
  onOutput?: (stream: 'stdout' | 'stderr', text: string) => void
  /** Electron-owned native folder chooser offered to the backend over IPC. */
  pickDirectory?: (title: string) => Promise<string | null>
  /** Startup timeout override used by tests. */
  startTimeoutMs?: number
  /** Graceful stop timeout override used by tests. */
  stopTimeoutMs?: number
}

/**
 * Service one validated backend request through the Electron-owned dialog.
 * @param message - untrusted message received from the backend child.
 * @param pickDirectory - desktop dialog implementation.
 * @param reply - response sender back to the child.
 * @returns whether the message belonged to this protocol.
 */
export async function serviceDesktopDirectoryPickerRequest(
  message: unknown,
  pickDirectory: (title: string) => Promise<string | null>,
  reply: (response: DesktopDirectoryPickerResponse) => void,
): Promise<boolean> {
  if (!isDesktopDirectoryPickerRequest(message)) return false
  try {
    reply({
      type: DESKTOP_PICK_RESPONSE,
      requestId: message.requestId,
      result: { ok: true, path: await pickDirectory(message.title) },
    })
  } catch (error: unknown) {
    reply({
      type: DESKTOP_PICK_RESPONSE,
      requestId: message.requestId,
      result: { ok: false, error: error instanceof Error ? error.message : String(error) },
    })
  }
  return true
}

/**
 * Resolve the built CLI entry from the desktop package's production dependency.
 * @returns absolute path to the packaged or workspace `dsh` entry.
 */
export function resolveCliEntry(): string {
  const require = createRequire(import.meta.url)
  const manifest = require.resolve('@deepseek-ai/dsh/package.json')
  const entry = join(dirname(manifest), 'lib', 'bin.js')
  if (!existsSync(entry)) {
    throw new Error(`DeepSeek Harness desktop: CLI build is missing at ${entry}; run pnpm run build first.`)
  }
  return entry
}

/**
 * Extract the settled loopback application URL from accumulated CLI output.
 * @param output - stdout accumulated from the supervised child.
 * @returns the validated URL, or `undefined` until the complete ready line arrives.
 */
export function extractBackendUrl(output: string): URL | undefined {
  const match = READY_LINE.exec(output)
  if (match?.[1] === undefined) return undefined
  const url = new URL(match[1])
  if (url.hostname !== '127.0.0.1' || url.protocol !== 'http:') return undefined
  return url
}

/**
 * Format all independently observed child termination facts.
 * @param outcome - exit code and signal reported by Node.
 * @returns concise diagnostic containing every available fact.
 */
export function formatBackendExit(outcome: BackendExit): string {
  const facts: string[] = []
  if (outcome.exitCode !== null) facts.push(`exit ${String(outcome.exitCode)}`)
  if (outcome.signalCode !== null) facts.push(`signal ${outcome.signalCode}`)
  return facts.length === 0 ? 'no exit code or signal' : facts.join(', ')
}

function appendDiagnostic(current: string, chunk: string): string {
  const combined = current + chunk
  return combined.length <= MAX_DIAGNOSTIC_CHARS
    ? combined
    : combined.slice(combined.length - MAX_DIAGNOSTIC_CHARS)
}

function waitForExit(child: ChildProcess): Promise<BackendExit> {
  return new Promise((resolve) => {
    child.once('exit', (exitCode, signalCode) => { resolve({ exitCode, signalCode }) })
  })
}

async function forceTerminate(child: ChildProcess, closed: Promise<BackendExit>, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill()
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      closed,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => { reject(new Error('DeepSeek Harness backend did not exit after forced termination.')) }, timeoutMs)
      }),
    ])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
  }
}

async function requestStop(child: ChildProcess, closed: Promise<BackendExit>, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return

  let timeout: ReturnType<typeof setTimeout> | undefined
  const graceful = child.connected
    ? new Promise<void>((resolve) => {
      const disconnect = (): void => {
        if (!child.connected) return
        try { child.disconnect() } catch { /* Process exit owns this race. */ }
      }
      try {
        child.send(SHUTDOWN_MESSAGE, () => {
          // Closing the supervisor channel is a second, ordered shutdown signal.
          // It also guarantees teardown if a future child stops recognizing the
          // explicit message while preserving every message queued before it.
          disconnect()
          resolve()
        })
      } catch {
        disconnect()
        resolve()
      }
    })
    : Promise.resolve()
  await graceful

  const outcome = await Promise.race([
    closed.then(() => 'closed' as const),
    new Promise<'timeout'>((resolve) => {
      timeout = setTimeout(() => { resolve('timeout') }, timeoutMs)
    }),
  ])
  if (timeout !== undefined) clearTimeout(timeout)
  if (outcome === 'timeout') await forceTerminate(child, closed, timeoutMs)
}

/**
 * Start a loopback-only Web profile under Electron's Node runtime.
 * @param options - runtime paths, environment, diagnostics, and lifecycle timeouts.
 * @returns the ready backend; startup failure terminates and awaits the child first.
 */
export async function startHarnessBackend(options: StartBackendOptions): Promise<HarnessBackend> {
  const entry = resolveCliEntry()
  // Electron's Node runtime has a different native ABI from the host Node
  // installation. Expose Node's bundled ESM loader so Harness can resolve
  // profile plugins without loading node-addon-require-builtin from that ABI.
  const child = spawn(options.executable, ['--expose-internals', entry, 'web', '--port', '0'], {
    cwd: options.cwd,
    env: {
      ...(options.environment ?? process.env),
      ELECTRON_RUN_AS_NODE: '1',
      ...(options.pickDirectory === undefined ? {} : { [DESKTOP_PARENT_PICKER_ENV]: '1' }),
      DSH_HOME: options.harnessHome,
      DSH_TELEMETRY_DISABLED: options.environment?.DSH_TELEMETRY_DISABLED
        ?? process.env.DSH_TELEMETRY_DISABLED
        ?? '1',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  })
  if (options.pickDirectory !== undefined) {
    const pickDirectory = options.pickDirectory
    child.on('message', (message: unknown) => {
      void serviceDesktopDirectoryPickerRequest(message, pickDirectory, (response) => {
        if (!child.connected) return
        try { child.send(response) } catch { /* Backend exit owns this race. */ }
      })
    })
  }
  const closed = waitForExit(child)
  let stdout = ''
  let stderr = ''

  const ready = new Promise<URL>((resolve, reject) => {
    let settled = false
    const finish = (result: { url: URL } | { error: Error }): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      child.off('error', onError)
      child.off('exit', onExit)
      if ('url' in result) resolve(result.url)
      else reject(result.error)
    }
    const onError = (error: Error): void => {
      finish({ error: new Error(`DeepSeek Harness backend failed to start: ${error.message}`, { cause: error }) })
    }
    const onExit = (exitCode: number | null, signalCode: NodeJS.Signals | null): void => {
      const detail = formatBackendExit({ exitCode, signalCode })
      const output = `${stdout}${stderr}`.trim()
      finish({ error: new Error(`DeepSeek Harness backend closed before it was ready (${detail}).${output === '' ? '' : `\n${output}`}`) })
    }
    const timeout = setTimeout(() => {
      finish({ error: new Error(`DeepSeek Harness backend did not become ready within ${String(options.startTimeoutMs ?? BACKEND_START_TIMEOUT_MS)} ms.${stderr.trim() === '' ? '' : `\n${stderr.trim()}`}`) })
    }, options.startTimeoutMs ?? BACKEND_START_TIMEOUT_MS)

    child.on('error', onError)
    child.on('exit', onExit)
    child.stdout?.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString()
      stdout = appendDiagnostic(stdout, text)
      options.onOutput?.('stdout', text)
      const url = extractBackendUrl(stdout)
      if (url !== undefined) finish({ url })
    })
    child.stderr?.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString()
      stderr = appendDiagnostic(stderr, text)
      options.onOutput?.('stderr', text)
    })
  })

  try {
    const url = await ready
    let stopPromise: Promise<void> | undefined
    return {
      url,
      closed,
      stop() {
        stopPromise ??= requestStop(child, closed, options.stopTimeoutMs ?? BACKEND_STOP_TIMEOUT_MS)
        return stopPromise
      },
    }
  } catch (error) {
    await forceTerminate(child, closed, options.stopTimeoutMs ?? BACKEND_STOP_TIMEOUT_MS)
    throw error
  }
}
