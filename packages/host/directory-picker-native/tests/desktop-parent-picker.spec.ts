import { describe, expect, it, vi } from 'vitest'
import {
  desktopDirectoryPickerFailure,
  desktopDirectoryPickerSuccess,
  desktopParentPickerAvailable,
  pickDesktopParentDirectory,
  type DesktopDirectoryPickerRequest,
  type DesktopParentPickerTransport,
} from '../src/desktop-parent-picker.ts'

function harness(sendFailure: Error | null = null): {
  transport: DesktopParentPickerTransport
  request: () => DesktopDirectoryPickerRequest
  message: (value: unknown) => void
  disconnect: () => void
  send: ReturnType<typeof vi.fn>
} {
  let sent: DesktopDirectoryPickerRequest | undefined
  let messageListener: ((message: unknown) => void) | undefined
  let disconnectListener: (() => void) | undefined
  const send = vi.fn((message: DesktopDirectoryPickerRequest, callback: (error: Error | null) => void) => {
    sent = message
    callback(sendFailure)
  })
  return {
    transport: {
      isConnected: () => true,
      send,
      onMessage(listener) {
        messageListener = listener
        return () => { messageListener = undefined }
      },
      onDisconnect(listener) {
        disconnectListener = listener
        return () => { disconnectListener = undefined }
      },
    },
    request: () => {
      if (sent === undefined) throw new Error('request not sent')
      return sent
    },
    message: (value) => { messageListener?.(value) },
    disconnect: () => { disconnectListener?.() },
    send,
  }
}

describe('desktop parent directory picker', () => {
  it('accepts only an opted-in connected IPC parent', () => {
    expect(desktopParentPickerAvailable({ DSH_DESKTOP_PARENT_PICKER: '1' }, { connected: true, send: vi.fn() })).toBe(true)
    expect(desktopParentPickerAvailable({}, { connected: true, send: vi.fn() })).toBe(false)
    expect(desktopParentPickerAvailable({ DSH_DESKTOP_PARENT_PICKER: '1' }, { connected: false, send: vi.fn() })).toBe(false)
  })

  it('resolves a selected path and cancellation from the matching parent response', async () => {
    const first = harness()
    const selected = pickDesktopParentDirectory(new AbortController().signal, first.transport)
    first.message({ type: 'unrelated' })
    first.message(desktopDirectoryPickerSuccess(first.request().requestId, 'C:\\workspace'))
    await expect(selected).resolves.toBe('C:\\workspace')

    const second = harness()
    const cancelled = pickDesktopParentDirectory(new AbortController().signal, second.transport)
    second.message(desktopDirectoryPickerSuccess(second.request().requestId, null))
    await expect(cancelled).resolves.toBeNull()
  })

  it('surfaces parent failure, caller abort, send failure, and disconnect', async () => {
    const failed = harness()
    const failure = pickDesktopParentDirectory(new AbortController().signal, failed.transport)
    failed.message(desktopDirectoryPickerFailure(failed.request().requestId, 'dialog failed'))
    await expect(failure).rejects.toThrow('dialog failed')

    const aborted = harness()
    const controller = new AbortController()
    const aborting = pickDesktopParentDirectory(controller.signal, aborted.transport)
    controller.abort()
    await expect(aborting).rejects.toThrow('aborted')

    const disconnected = harness()
    const disconnecting = pickDesktopParentDirectory(new AbortController().signal, disconnected.transport)
    disconnected.disconnect()
    await expect(disconnecting).rejects.toThrow('disconnected')

    const sendError = harness(new Error('send failed'))
    await expect(pickDesktopParentDirectory(new AbortController().signal, sendError.transport))
      .rejects.toThrow('send failed')
  })

  it('rejects before sending when already aborted or disconnected', async () => {
    const aborted = harness()
    const controller = new AbortController()
    controller.abort()
    await expect(pickDesktopParentDirectory(controller.signal, aborted.transport)).rejects.toThrow('aborted')
    expect(aborted.send).not.toHaveBeenCalled()

    const disconnected = harness()
    disconnected.transport.isConnected = () => false
    await expect(pickDesktopParentDirectory(new AbortController().signal, disconnected.transport))
      .rejects.toThrow('disconnected')
  })
})
