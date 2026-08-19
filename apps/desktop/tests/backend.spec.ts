import { describe, expect, it, vi } from 'vitest'
import { extractBackendUrl, formatBackendExit, serviceDesktopDirectoryPickerRequest } from '../src/backend.ts'
import { systemProxyEnvironment } from '../src/system-proxy.ts'

describe('desktop backend protocol', () => {
  it('extracts only a complete loopback ready line', () => {
    expect(extractBackendUrl('loading\ndsh web: http://127.0.0.1:4123\n')?.href).toBe('http://127.0.0.1:4123/')
    expect(extractBackendUrl('dsh web: http://127.0.0.1:41')).toBeUndefined()
    expect(extractBackendUrl('dsh web: http://192.168.1.2:4123\n')).toBeUndefined()
    expect(extractBackendUrl('prefix dsh web: http://127.0.0.1:4123\n')).toBeUndefined()
  })

  it('reports exit and signal facts independently', () => {
    expect(formatBackendExit({ exitCode: 1, signalCode: 'SIGTERM' })).toBe('exit 1, signal SIGTERM')
    expect(formatBackendExit({ exitCode: 0, signalCode: null })).toBe('exit 0')
    expect(formatBackendExit({ exitCode: null, signalCode: null })).toBe('no exit code or signal')
  })

  it('services validated directory-picker requests and serializes failures', async () => {
    const replies: unknown[] = []
    const handled = await serviceDesktopDirectoryPickerRequest(
      { type: 'dsh:desktop-pick-directory', requestId: 'pick-1', title: 'Choose' },
      async title => title === 'Choose' ? 'C:\\picked' : null,
      (response) => { replies.push(response) },
    )
    expect(handled).toBe(true)
    expect(replies).toEqual([{
      type: 'dsh:desktop-pick-directory-result',
      requestId: 'pick-1',
      result: { ok: true, path: 'C:\\picked' },
    }])

    await serviceDesktopDirectoryPickerRequest(
      { type: 'dsh:desktop-pick-directory', requestId: 'pick-2', title: 'Choose' },
      async () => { throw new Error('native dialog unavailable') },
      (response) => { replies.push(response) },
    )
    expect(replies[1]).toMatchObject({
      requestId: 'pick-2', result: { ok: false, error: 'native dialog unavailable' },
    })
  })

  it('ignores unrelated or malformed backend IPC messages', async () => {
    const pick = vi.fn(async () => null)
    const reply = vi.fn()
    await expect(serviceDesktopDirectoryPickerRequest({ type: 'other' }, pick, reply)).resolves.toBe(false)
    await expect(serviceDesktopDirectoryPickerRequest(
      { type: 'dsh:desktop-pick-directory', requestId: '', title: 'Choose' }, pick, reply,
    )).resolves.toBe(false)
    expect(pick).not.toHaveBeenCalled()
    expect(reply).not.toHaveBeenCalled()
  })

  it('passes a supported system proxy to downloads without overriding explicit proxy settings', () => {
    expect(systemProxyEnvironment('PROXY 127.0.0.1:7890; DIRECT', {})).toEqual({
      HTTPS_PROXY: 'http://127.0.0.1:7890/',
    })
    expect(systemProxyEnvironment('HTTPS proxy.example:443; DIRECT', {})).toEqual({
      HTTPS_PROXY: 'https://proxy.example/',
    })
    expect(systemProxyEnvironment('SOCKS5 127.0.0.1:1080; DIRECT', {})).toEqual({})
    expect(systemProxyEnvironment('PROXY system.example:80', { HTTPS_PROXY: 'http://explicit.example:8080' })).toEqual({})
  })
})
