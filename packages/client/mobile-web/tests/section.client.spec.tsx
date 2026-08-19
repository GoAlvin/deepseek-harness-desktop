// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type {} from '../src/client/index.ts'
import type { MobileWebStatus } from '../src/protocol.ts'
import { MobileWebSection, type MobileWebSectionProps } from '../src/client/MobileWebSection.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const LAN_URL = 'http://192.168.1.20:3081/?dsh_access=lan'
const PUBLIC_URL = 'https://phone-access.trycloudflare.com/?dsh_access=public'

function state(publicAccess = false): MobileWebStatus {
  return {
    proxyRunning: true,
    proxyPort: 3081,
    lanUrl: LAN_URL,
    lanQr: 'data:image/png;base64,bGFu',
    tunnelUrl: publicAccess ? PUBLIC_URL : null,
    tunnelQr: publicAccess ? 'data:image/png;base64,cHVibGlj' : null,
    tunnelPhase: publicAccess ? 'ready' : 'idle',
    tunnelDetail: publicAccess ? 'ready' : '',
    downloadProgress: null,
  }
}

function props(overrides: Partial<MobileWebSectionProps> = {}): MobileWebSectionProps {
  return {
    close: vi.fn(),
    useSessions: vi.fn() as never,
    useWorkspaces: vi.fn() as never,
    t: key => en[key as keyof typeof en],
    load: vi.fn().mockResolvedValue(state()),
    startAccess: vi.fn().mockResolvedValue(state()),
    stopAccess: vi.fn().mockResolvedValue({ ...state(), proxyRunning: false, proxyPort: null, lanUrl: null, lanQr: null }),
    startTunnel: vi.fn().mockResolvedValue(state(true)),
    stopTunnel: vi.fn().mockResolvedValue(state()),
    ...overrides,
  }
}

describe('MobileWebSection', () => {
  it('shows pairing links and drives the public-tunnel lifecycle', async () => {
    const copy = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } })
    const input = props()
    render(<MobileWebSection {...input} />)

    expect(await screen.findByText(LAN_URL)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: en.copy }))
    await waitFor(() => { expect(copy).toHaveBeenCalledWith(LAN_URL) })

    fireEvent.click(screen.getByRole('button', { name: en.start }))
    expect(await screen.findByText(PUBLIC_URL)).toBeDefined()
    expect(input.startTunnel).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: en.stop }))
    await waitFor(() => { expect(input.stopTunnel).toHaveBeenCalledOnce() })
    await waitFor(() => { expect(screen.queryByText(PUBLIC_URL)).toBeNull() })
  })

  it('reports a Host status failure without hiding the security warning', async () => {
    render(<MobileWebSection {...props({ load: vi.fn().mockRejectedValue(new Error('offline')) })} />)
    expect((await screen.findByRole('alert')).textContent).toContain('offline')
    expect(screen.getByText(en.security)).toBeDefined()
  })

  it('shows byte progress and lets the user disable all phone access', async () => {
    const downloading: MobileWebStatus = {
      ...state(),
      tunnelPhase: 'downloading',
      tunnelDetail: 'downloading',
      downloadProgress: { receivedBytes: 11 * 1024 * 1024, totalBytes: 55 * 1024 * 1024, bytesPerSecond: 2 * 1024 * 1024 },
    }
    const input = props({ load: vi.fn().mockResolvedValue(downloading) })
    render(<MobileWebSection {...input} />)

    expect(await screen.findByRole('progressbar', { name: en.downloadProgress })).toHaveProperty('value', 20)
    expect(screen.getByText('11.0 MB / 55.0 MB')).toBeDefined()
    expect(screen.getByText('20% · 2.0 MB/s')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: en.disableAccess }))
    await waitFor(() => { expect(input.stopAccess).toHaveBeenCalledOnce() })
    expect(await screen.findByText(en.accessDisabled)).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: en.enableAccess }))
    await waitFor(() => { expect(input.startAccess).toHaveBeenCalledOnce() })
    expect(await screen.findByText(LAN_URL)).toBeDefined()
  })
})
