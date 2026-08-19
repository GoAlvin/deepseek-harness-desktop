/** Pinned Cloudflare quick-tunnel launcher for the Windows desktop release. */

import { createHash } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { get as httpsGet } from 'node:https'
import { join } from 'node:path'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { HttpsProxyAgent } from 'https-proxy-agent'
import type { MobileWebDownloadProgress, TunnelPhase } from './protocol.ts'

const CLOUDFLARED_VERSION = '2026.8.2'
const WINDOWS_X64_SHA256 = 'c29eee2b121f5436a642eed69fd9767da7e7b8c510fa50aaa130337f931357b5'
const PUBLIC_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/iu
const MAX_BINARY_BYTES = 64 * 1024 * 1024
const MAX_REDIRECTS = 5
const DOWNLOAD_CONNECTION_TIMEOUT_MS = 60_000
const DOWNLOAD_IDLE_TIMEOUT_MS = 30_000
const DOWNLOAD_TOTAL_TIMEOUT_MS = 15 * 60_000
const PROGRESS_INTERVAL_MS = 200

type PhaseSink = (phase: Extract<TunnelPhase, 'downloading' | 'starting'>, detail: string, progress: MobileWebDownloadProgress | null) => void

function downloadAgent(): HttpsProxyAgent<string> | undefined {
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy
    ?? process.env.HTTP_PROXY ?? process.env.http_proxy
  return proxy === undefined || proxy.length === 0 ? undefined : new HttpsProxyAgent(proxy)
}

async function download(
  url: URL,
  onProgress: (progress: MobileWebDownloadProgress) => void,
  signal: AbortSignal,
  redirects = 0,
): Promise<Buffer> {
  if (redirects > MAX_REDIRECTS) throw new Error('cloudflared download exceeded the redirect limit')
  return await new Promise<Buffer>((resolve, reject) => {
    const startedAt = Date.now()
    let lastProgressAt = 0
    const request = httpsGet(url, {
      agent: downloadAgent(),
      headers: { 'user-agent': 'DeepSeek-Harness' },
    }, (response) => {
      clearTimeout(connectionTimer)
      const location = response.headers.location
      if (response.statusCode !== undefined && response.statusCode >= 300 && response.statusCode < 400 && location !== undefined) {
        clearTimeout(downloadTimer)
        response.resume()
        void download(new URL(location, url), onProgress, signal, redirects + 1).then(resolve, reject)
        return
      }
      if (response.statusCode !== 200) {
        clearTimeout(downloadTimer)
        response.resume()
        reject(new Error(`cloudflared download failed: HTTP ${String(response.statusCode ?? 'unknown')}`))
        return
      }
      const declared = Number(response.headers['content-length'] ?? 0)
      if (declared > MAX_BINARY_BYTES) {
        clearTimeout(downloadTimer)
        response.destroy()
        reject(new Error(`cloudflared download is larger than ${String(MAX_BINARY_BYTES)} bytes`))
        return
      }
      const totalBytes = Number.isFinite(declared) && declared > 0 ? declared : null
      const chunks: Buffer[] = []
      let received = 0
      const report = (force = false): void => {
        const now = Date.now()
        if (!force && now - lastProgressAt < PROGRESS_INTERVAL_MS) return
        lastProgressAt = now
        const elapsedSeconds = Math.max((now - startedAt) / 1000, 0.001)
        onProgress({ receivedBytes: received, totalBytes, bytesPerSecond: received / elapsedSeconds })
      }
      report(true)
      response.setTimeout(DOWNLOAD_IDLE_TIMEOUT_MS, () => {
        response.destroy(new Error(`cloudflared download received no data for ${String(DOWNLOAD_IDLE_TIMEOUT_MS)}ms`))
      })
      response.on('data', (chunk: Buffer) => {
        received += chunk.length
        if (received > MAX_BINARY_BYTES) {
          response.destroy(new Error(`cloudflared download is larger than ${String(MAX_BINARY_BYTES)} bytes`))
          return
        }
        chunks.push(chunk)
        report()
      })
      response.once('error', (error) => {
        clearTimeout(downloadTimer)
        reject(error)
      })
      response.once('end', () => {
        clearTimeout(downloadTimer)
        report(true)
        resolve(Buffer.concat(chunks))
      })
    })
    const connectionTimer = setTimeout(() => {
      request.destroy(new Error(`cloudflared download connection timed out after ${String(DOWNLOAD_CONNECTION_TIMEOUT_MS)}ms`))
    }, DOWNLOAD_CONNECTION_TIMEOUT_MS)
    const downloadTimer = setTimeout(() => {
      request.destroy(new Error(`cloudflared download timed out after ${String(DOWNLOAD_TOTAL_TIMEOUT_MS)}ms`))
    }, DOWNLOAD_TOTAL_TIMEOUT_MS)
    const onAbort = (): void => { request.destroy(new Error('cloudflared download cancelled')) }
    signal.addEventListener('abort', onAbort, { once: true })
    const clear = (): void => {
      clearTimeout(connectionTimer)
      clearTimeout(downloadTimer)
      signal.removeEventListener('abort', onAbort)
    }
    request.once('error', (error) => {
      clear()
      reject(error)
    })
    request.once('close', clear)
    if (signal.aborted) onAbort()
  })
}

/** Running Cloudflare tunnel handle. */
export interface QuickTunnel {
  readonly url: string
  stop(): void
  readonly closed: Promise<void>
}

async function usable(command: string): Promise<boolean> {
  return await new Promise((resolve) => {
    const child = spawn(command, ['--version'], { stdio: 'ignore', windowsHide: true })
    child.once('error', () => { resolve(false) })
    child.once('exit', (code) => { resolve(code === 0) })
  })
}

async function windowsBinary(onPhase: PhaseSink, signal: AbortSignal): Promise<string> {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('Automatic cloudflared installation currently supports Windows x64; install cloudflared on PATH for this platform.')
  }
  const directory = dshHomePath('mobile-web', 'bin')
  const binary = join(directory, 'cloudflared.exe')
  try {
    const current = await readFile(binary)
    if (createHash('sha256').update(current).digest('hex') === WINDOWS_X64_SHA256) return binary
  } catch { /* A missing or stale binary is replaced below. */ }

  onPhase('downloading', `正在下载 cloudflared ${CLOUDFLARED_VERSION}…`, {
    receivedBytes: 0,
    totalBytes: null,
    bytesPerSecond: 0,
  })
  await mkdir(directory, { recursive: true })
  const bytes = await download(
    new URL(`https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-windows-amd64.exe`),
    (progress) => { onPhase('downloading', `正在下载 cloudflared ${CLOUDFLARED_VERSION}…`, progress) },
    signal,
  )
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== WINDOWS_X64_SHA256) throw new Error(`cloudflared checksum mismatch: ${digest}`)
  await writeFile(binary, bytes, { mode: 0o700 })
  return binary
}

async function resolveCloudflared(onPhase: PhaseSink, signal: AbortSignal): Promise<string> {
  if (await usable('cloudflared')) return 'cloudflared'
  return await windowsBinary(onPhase, signal)
}

/**
 * Start a Cloudflare quick tunnel and wait for its public HTTPS URL.
 * @param proxyPort - loopback proxy port exposed through the tunnel.
 * @param timeoutMs - maximum wait for the public URL.
 * @param onPhase - download and connection progress sink.
 * @param signal - cancellation for download and tunnel startup.
 * @returns running tunnel handle once the URL is ready.
 */
export async function startQuickTunnel(
  proxyPort: number,
  timeoutMs: number,
  onPhase: PhaseSink,
  signal: AbortSignal = new AbortController().signal,
): Promise<QuickTunnel> {
  const command = await resolveCloudflared(onPhase, signal)
  if (signal.aborted) throw new Error('cloudflared startup cancelled')
  onPhase('starting', '正在连接 Cloudflare 边缘网络…', null)
  const child: ChildProcess = spawn(command, [
    'tunnel', '--url', `http://127.0.0.1:${String(proxyPort)}`,
    '--protocol', 'http2', '--no-autoupdate',
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  const closed = new Promise<void>((resolve) => { child.once('exit', () => { resolve() }) })
  let timer: ReturnType<typeof setTimeout> | undefined
  const url = await new Promise<string>((resolve, reject) => {
    let output = ''
    let settled = false
    const finish = (result: { url: string } | { error: Error }): void => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      child.off('error', onError)
      child.off('exit', onExit)
      signal.removeEventListener('abort', onAbort)
      if ('url' in result) resolve(result.url)
      else reject(result.error)
    }
    const onData = (chunk: Buffer): void => {
      output = (output + chunk.toString()).slice(-16_000)
      const found = output.match(PUBLIC_URL)?.[0]
      if (found !== undefined) finish({ url: found })
    }
    const onError = (error: Error): void => { finish({ error }) }
    const onExit = (code: number | null): void => { finish({ error: new Error(`cloudflared exited before ready (${String(code)})`) }) }
    const onAbort = (): void => {
      child.kill()
      finish({ error: new Error('cloudflared startup cancelled') })
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    child.once('error', onError)
    child.once('exit', onExit)
    signal.addEventListener('abort', onAbort, { once: true })
    timer = setTimeout(() => {
      child.kill()
      finish({ error: new Error(`cloudflared did not publish a URL within ${String(timeoutMs)}ms`) })
    }, timeoutMs)
    if (signal.aborted) onAbort()
  }).catch((error: unknown) => {
    child.kill()
    throw error
  })
  return { url, stop: () => { child.kill() }, closed }
}
