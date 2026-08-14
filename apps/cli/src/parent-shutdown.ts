/** Parent-process IPC ownership for supervised CLI invocations. */

import type { ProcessShutdown } from './process-shutdown.ts'

/** Exact message a supervising parent sends to request graceful shutdown. */
export const PARENT_SHUTDOWN_MESSAGE = 'dsh:parent-shutdown'

/**
 * Install shutdown ownership for a CLI launched with a Node IPC channel.
 * The channel is unreferenced so one-shot profiles can still finish naturally.
 * @param shutdown - profile controller that disposes the complete plugin tree.
 * @param parentProcess - IPC-bearing process object, replaceable by tests.
 * @param onClose - synchronous startup cancellation invoked before tree disposal.
 * @returns a disposer that removes the parent listeners without stopping the profile.
 */
export function installParentShutdown(
  shutdown: ProcessShutdown,
  parentProcess: NodeJS.Process = process,
  onClose: () => void = () => {},
): () => void {
  // Electron's Node mode can expose the IPC channel after the entry module has
  // started. Message listeners do not keep a standalone process alive, so
  // install them unconditionally and adopt the channel when it appears.

  let closing = false
  const dispose = (): void => {
    parentProcess.off('message', onMessage)
    parentProcess.off('disconnect', onDisconnect)
  }
  const close = (): void => {
    if (closing) return
    closing = true
    dispose()
    onClose()
    void shutdown.shutdown(0).finally(() => {
      if (parentProcess.connected) parentProcess.disconnect()
    })
  }
  const onMessage = (message: unknown): void => {
    if (typeof message !== 'object' || message === null) return
    const record = message as Record<string, unknown>
    if (Reflect.ownKeys(record).length !== 1 || record.type !== PARENT_SHUTDOWN_MESSAGE) return
    close()
  }
  const onDisconnect = (): void => { close() }

  parentProcess.on('message', onMessage)
  parentProcess.on('disconnect', onDisconnect)
  parentProcess.channel?.unref()
  return dispose
}
