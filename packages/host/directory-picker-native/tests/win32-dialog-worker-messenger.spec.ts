import { describe, expect, it, vi } from 'vitest'
import {
  postWorkerMessage,
  type Win32DialogWorkerIpc,
} from '../src/win32-dialog-worker-messenger.ts'

function harness(): {
  ipc: Win32DialogWorkerIpc
  send: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
} {
  const send = vi.fn(() => true)
  const disconnect = vi.fn()
  return {
    ipc: { connected: true, send, disconnect },
    send,
    disconnect,
  }
}

describe('Win32 dialog worker messenger', () => {
  it('keeps IPC connected after showing and disconnects only after done flushes', () => {
    const { ipc, send, disconnect } = harness()

    postWorkerMessage(ipc, { kind: 'showing', threadId: 42 })
    expect(send).toHaveBeenLastCalledWith({ kind: 'showing', threadId: 42 })
    expect(disconnect).not.toHaveBeenCalled()

    postWorkerMessage(ipc, { kind: 'done', path: 'C:\\workspace' })
    const flush = send.mock.calls.at(-1)?.[1] as (() => void) | undefined
    expect(flush).toBeTypeOf('function')
    expect(disconnect).not.toHaveBeenCalled()
    flush?.()
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('uses the same terminal flush rule for errors and tolerates an already closed channel', () => {
    const { ipc, send, disconnect } = harness()
    ipc.connected = false

    postWorkerMessage(ipc, { kind: 'error', message: 'failed' })
    const flush = send.mock.calls.at(-1)?.[1] as (() => void) | undefined
    flush?.()
    expect(disconnect).not.toHaveBeenCalled()
  })
})
