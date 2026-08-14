/** Desktop-parent IPC transport for a native folder dialog owned by Electron. */

/** Environment opt-in set only by the desktop host. */
export const DESKTOP_PARENT_PICKER_ENV = 'DSH_DESKTOP_PARENT_PICKER'

const REQUEST_TYPE = 'dsh:desktop-pick-directory'
const RESPONSE_TYPE = 'dsh:desktop-pick-directory-result'

/** Backend-to-desktop request for one native directory chooser. */
export interface DesktopDirectoryPickerRequest {
  type: typeof REQUEST_TYPE
  requestId: string
  title: string
}

/** Desktop-to-backend result for one native directory chooser. */
export type DesktopDirectoryPickerResponse = {
  type: typeof RESPONSE_TYPE
  requestId: string
  result: { ok: true; path: string | null } | { ok: false; error: string }
}

/** Injectable IPC transport used by the backend-side request driver. */
export interface DesktopParentPickerTransport {
  isConnected(): boolean
  send(message: DesktopDirectoryPickerRequest, callback: (error: Error | null) => void): void
  onMessage(listener: (message: unknown) => void): () => void
  onDisconnect(listener: () => void): () => void
}

/**
 * Validate an untrusted backend IPC message as a directory-picker request.
 * @param message - message received from the backend IPC channel.
 * @returns whether the message is a complete picker request.
 */
export function isDesktopDirectoryPickerRequest(message: unknown): message is DesktopDirectoryPickerRequest {
  if (typeof message !== 'object' || message === null) return false
  const record = message as Record<string, unknown>
  return record.type === REQUEST_TYPE
    && typeof record.requestId === 'string'
    && record.requestId !== ''
    && typeof record.title === 'string'
    && record.title !== ''
}

/**
 * Build the success response owned by the desktop parent.
 * @param requestId - identifier copied from the matching request.
 * @param path - selected directory, or null when the user cancels.
 * @returns the response sent to the backend.
 */
export function desktopDirectoryPickerSuccess(requestId: string, path: string | null): DesktopDirectoryPickerResponse {
  return { type: RESPONSE_TYPE, requestId, result: { ok: true, path } }
}

/**
 * Build the failure response owned by the desktop parent.
 * @param requestId - identifier copied from the matching request.
 * @param error - failure text safe to return to the backend.
 * @returns the response sent to the backend.
 */
export function desktopDirectoryPickerFailure(requestId: string, error: string): DesktopDirectoryPickerResponse {
  return { type: RESPONSE_TYPE, requestId, result: { ok: false, error } }
}

function isResponse(message: unknown, requestId: string): message is DesktopDirectoryPickerResponse {
  if (typeof message !== 'object' || message === null) return false
  const record = message as Record<string, unknown>
  if (record.type !== RESPONSE_TYPE || record.requestId !== requestId) return false
  if (typeof record.result !== 'object' || record.result === null) return false
  const result = record.result as Record<string, unknown>
  if (result.ok === false) return typeof result.error === 'string'
  return result.ok === true && (typeof result.path === 'string' || result.path === null)
}

function processTransport(): DesktopParentPickerTransport {
  if (process.send === undefined) throw new Error('desktop parent directory picker needs an IPC parent')
  const send = process.send.bind(process)
  return {
    isConnected: () => process.connected,
    send(message, callback) { send(message, callback) },
    onMessage(listener) {
      process.on('message', listener)
      return () => { process.off('message', listener) }
    },
    onDisconnect(listener) {
      process.on('disconnect', listener)
      return () => { process.off('disconnect', listener) }
    },
  }
}

/**
 * Whether this backend was launched with an Electron directory-picker parent.
 * @param environment - backend environment containing the desktop opt-in marker.
 * @param parent - process capabilities required for connected IPC.
 * @returns whether the parent picker transport is available.
 */
export function desktopParentPickerAvailable(
  environment: NodeJS.ProcessEnv = process.env,
  parent: Pick<NodeJS.Process, 'connected' | 'send'> = process,
): boolean {
  return environment[DESKTOP_PARENT_PICKER_ENV] === '1'
    && parent.connected
    && parent.send !== undefined
}

let requestSequence = 0

/**
 * Ask the Electron parent to show its native folder dialog.
 * @param signal - caller/connection lifetime.
 * @param transport - IPC surface override for deterministic tests.
 * @returns the selected path, or null when the user cancels.
 */
export async function pickDesktopParentDirectory(
  signal: AbortSignal,
  transport?: DesktopParentPickerTransport,
): Promise<string | null> {
  if (signal.aborted) throw new Error('desktop parent directory picker aborted')
  const activeTransport = transport ?? processTransport()
  if (!activeTransport.isConnected()) throw new Error('desktop parent directory picker is disconnected')
  requestSequence += 1
  const requestId = `${String(process.pid)}-${String(requestSequence)}`

  return await new Promise<string | null>((resolve, reject) => {
    let settled = false
    let removeMessage = (): void => {}
    let removeDisconnect = (): void => {}
    const settle = (outcome: () => void): void => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      removeMessage()
      removeDisconnect()
      outcome()
    }
    const onAbort = (): void => {
      settle(() => { reject(new Error('desktop parent directory picker aborted')) })
    }
    const onDisconnect = (): void => {
      settle(() => { reject(new Error('desktop parent directory picker disconnected')) })
    }
    const onMessage = (message: unknown): void => {
      if (!isResponse(message, requestId)) return
      settle(() => {
        if (message.result.ok) resolve(message.result.path)
        else reject(new Error(`desktop parent directory picker failed: ${message.result.error}`))
      })
    }

    removeMessage = activeTransport.onMessage(onMessage)
    removeDisconnect = activeTransport.onDisconnect(onDisconnect)
    signal.addEventListener('abort', onAbort, { once: true })
    activeTransport.send({ type: REQUEST_TYPE, requestId, title: 'Select Workspace Directory' }, (error) => {
      if (error !== null) settle(() => { reject(error) })
    })
  })
}
