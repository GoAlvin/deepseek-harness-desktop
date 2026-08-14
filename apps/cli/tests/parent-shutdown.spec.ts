import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import {
  installParentShutdown,
  PARENT_SHUTDOWN_MESSAGE,
} from '../src/parent-shutdown.ts'
import type { ProcessShutdown } from '../src/process-shutdown.ts'

interface TestChannel extends EventEmitter {
  connected: boolean
  send: ReturnType<typeof vi.fn> | undefined
  channel: { unref: ReturnType<typeof vi.fn> } | undefined
  disconnect: ReturnType<typeof vi.fn>
}

function channel(): TestChannel {
  const emitter = new EventEmitter() as TestChannel
  emitter.connected = true
  emitter.send = vi.fn()
  emitter.channel = { unref: vi.fn() }
  emitter.disconnect = vi.fn(() => { emitter.connected = false })
  return emitter
}

function controller(): ProcessShutdown & { shutdown: ReturnType<typeof vi.fn> } {
  return {
    shutdown: vi.fn(() => Promise.resolve()),
    interrupt: vi.fn(),
  }
}

describe('parent-owned profile shutdown', () => {
  it('unrefs IPC and accepts only the exact shutdown message', async () => {
    const parent = channel()
    const shutdown = controller()
    installParentShutdown(shutdown, parent as unknown as NodeJS.Process)

    expect(parent.channel?.unref).toHaveBeenCalledOnce()
    parent.emit('message', { type: PARENT_SHUTDOWN_MESSAGE, extra: true })
    parent.emit('message', PARENT_SHUTDOWN_MESSAGE)
    expect(shutdown.shutdown).not.toHaveBeenCalled()

    parent.emit('message', { type: PARENT_SHUTDOWN_MESSAGE })
    await vi.waitFor(() => { expect(parent.disconnect).toHaveBeenCalledOnce() })
    expect(shutdown.shutdown).toHaveBeenCalledWith(0)
  })

  it('shuts down once when the parent disconnects', async () => {
    const parent = channel()
    const shutdown = controller()
    const onClose = vi.fn()
    installParentShutdown(shutdown, parent as unknown as NodeJS.Process, onClose)

    parent.connected = false
    parent.emit('disconnect')
    parent.emit('disconnect')
    await vi.waitFor(() => { expect(shutdown.shutdown).toHaveBeenCalledOnce() })
    expect(onClose).toHaveBeenCalledOnce()
    expect(parent.disconnect).not.toHaveBeenCalled()
  })

  it('installs an inert listener before an IPC channel appears', () => {
    const parent = channel()
    parent.send = undefined
    parent.channel = undefined
    const shutdown = controller()
    const dispose = installParentShutdown(shutdown, parent as unknown as NodeJS.Process)

    dispose()
    expect(shutdown.shutdown).not.toHaveBeenCalled()
  })
})
