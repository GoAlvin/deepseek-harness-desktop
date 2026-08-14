/** IPC delivery rules for the Win32 dialog worker's notice and terminal messages. */

import type { Win32DialogWorkerMessage } from './win32-dialog-worker.ts'

/** Minimal child-process IPC surface used by the worker messenger. */
export interface Win32DialogWorkerIpc {
  connected: boolean
  send(message: Win32DialogWorkerMessage, callback?: (error: Error | null) => void): boolean
  disconnect(): void
}

/**
 * Deliver one worker message, closing IPC only after a terminal result flushes.
 * The `showing` notice precedes a blocking native call, so disconnecting from
 * its callback can race and discard the later `done` or `error` message.
 * @param ipc - child-process IPC channel.
 * @param message - worker notice or terminal outcome.
 */
export function postWorkerMessage(ipc: Win32DialogWorkerIpc, message: Win32DialogWorkerMessage): void {
  if (message.kind === 'showing') {
    ipc.send(message)
    return
  }
  ipc.send(message, () => {
    if (ipc.connected) ipc.disconnect()
  })
}
