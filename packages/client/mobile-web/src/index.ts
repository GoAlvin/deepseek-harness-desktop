/** Authenticated LAN and Cloudflare phone-browser access for the Web profile. */

import { randomBytes } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import QRCode from 'qrcode'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { createMobileProxy, type MobileProxy } from './proxy.ts'
import { startQuickTunnel, type QuickTunnel } from './tunnel.ts'
import { MOBILE_WEB_CHANNEL, type MobileWebDownloadProgress, type MobileWebStatus, type TunnelPhase } from './protocol.ts'

/** Stable Cordis plugin name. */
export const name = 'client-mobile-web'
/** Host services required by phone access. */
export const inject = ['connection', 'webServer']

/** Mobile Web deployment settings. */
export interface Config {
  /** First all-interface proxy port; zero asks the OS for a free port. */
  proxyPort: number
  /** Maximum wait for cloudflared to publish its public URL. */
  tunnelStartupTimeoutMs: number
}

/** Validated mobile Web settings. */
export const Config: z<Config> = z.object({
  proxyPort: z.natural().max(65535).default(3081),
  tunnelStartupTimeoutMs: z.natural().min(1000).default(45_000),
})

function lanAddress(): string | undefined {
  const candidates = Object.entries(networkInterfaces()).flatMap(([name, addresses]) =>
    (addresses ?? []).filter(address => address.family === 'IPv4' && !address.internal)
      .map(address => ({ name, address: address.address })))
  const privateAddress = candidates.find(candidate =>
    /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/u.test(candidate.address)
    && !/(?:virtual|vmware|vEthernet|wsl|docker|vpn|tun|tap|tailscale|zerotier)/iu.test(candidate.name))
  return privateAddress?.address ?? candidates[0]?.address
}

function token(): string { return randomBytes(24).toString('base64url') }

function pairingUrl(origin: string, accessToken: string): string {
  const url = new URL(origin)
  url.searchParams.set('dsh_access', accessToken)
  return url.href
}

async function qr(url: string | null): Promise<string | null> {
  return url === null ? null : await QRCode.toDataURL(url, { width: 220, margin: 1, errorCorrectionLevel: 'M' })
}

function ok<T>(value: T): RpcResult<T> { return { ok: true, value } }
function fail(message: string): RpcResult<never> {
  return { ok: false, error: { code: 'bad-request', message, details: { issues: [] } } }
}

/** Mount the proxy, tunnel lifecycle, and loopback control RPC. */
export function apply(ctx: Context, config: Config): void {
  let accessToken = token()
  let proxy: MobileProxy | undefined
  let tunnel: QuickTunnel | undefined
  let tunnelPhase: TunnelPhase = 'idle'
  let tunnelDetail = ''
  let downloadProgress: MobileWebDownloadProgress | null = null
  let starting: Promise<void> | undefined
  let startingAbort: AbortController | undefined
  let proxyStarting: Promise<void> | undefined
  const lifecycle = { accessEnabled: true, active: true }

  const startProxy = async (): Promise<void> => {
    lifecycle.accessEnabled = true
    if (proxy !== undefined) return
    if (proxyStarting !== undefined) {
      await proxyStarting
      return
    }
    proxyStarting = (async () => {
      const created = await createMobileProxy({
        port: config.proxyPort,
        upstreamPort: ctx.webServer.port,
        token: () => accessToken,
      })
      if (!lifecycle.active || !lifecycle.accessEnabled) {
        await created.close()
        return
      }
      proxy = created
    })().finally(() => { proxyStarting = undefined })
    await proxyStarting
  }

  const stopAccess = async (): Promise<void> => {
    lifecycle.accessEnabled = false
    startingAbort?.abort()
    try { await starting } catch { /* The access switch intentionally cancels tunnel startup. */ }
    tunnel?.stop()
    tunnel = undefined
    accessToken = token()
    tunnelPhase = 'idle'
    tunnelDetail = ''
    downloadProgress = null
    await proxyStarting
    const current = proxy
    proxy = undefined
    if (current !== undefined) await current.close()
  }

  const status = async (): Promise<MobileWebStatus> => {
    const lan = lanAddress()
    const lanUrl = proxy === undefined || lan === undefined
      ? null : pairingUrl(`http://${lan}:${String(proxy.port)}/`, accessToken)
    const tunnelUrl = tunnel === undefined ? null : pairingUrl(`${tunnel.url}/`, accessToken)
    return {
      proxyRunning: proxy !== undefined,
      proxyPort: proxy?.port ?? null,
      lanUrl,
      lanQr: await qr(lanUrl),
      tunnelUrl,
      tunnelQr: await qr(tunnelUrl),
      tunnelPhase,
      tunnelDetail,
      downloadProgress,
    }
  }

  const openTunnel = async (): Promise<void> => {
    if (tunnel !== undefined) return
    if (starting !== undefined) {
      await starting
      return
    }
    starting = (async () => {
      if (proxy === undefined) throw new Error('phone proxy is not ready')
      accessToken = token()
      tunnelPhase = 'starting'
      tunnelDetail = ''
      downloadProgress = null
      const abort = new AbortController()
      startingAbort = abort
      try {
        const createdTunnel = await startQuickTunnel(proxy.port, config.tunnelStartupTimeoutMs, (phase, detail, progress) => {
          tunnelPhase = phase
          tunnelDetail = detail
          downloadProgress = progress
        }, abort.signal)
        if (!lifecycle.accessEnabled) {
          createdTunnel.stop()
          await createdTunnel.closed
          throw new Error('phone access was disabled while the public tunnel was starting')
        }
        tunnel = createdTunnel
        tunnelPhase = 'ready'
        tunnelDetail = '公网隧道已就绪。'
        void tunnel.closed.then(() => {
          tunnel = undefined
          if (tunnelPhase === 'ready') {
            tunnelPhase = 'error'
            tunnelDetail = 'Cloudflare 隧道已意外退出，请重新开启。'
          }
        })
      } catch (error) {
        tunnelPhase = 'error'
        tunnelDetail = error instanceof Error ? error.message : String(error)
        throw error
      } finally {
        if (startingAbort === abort) startingAbort = undefined
        starting = undefined
      }
    })()
    await starting
  }

  ctx.effect(() => {
    void startProxy().catch((error: unknown) => {
      tunnelPhase = 'error'
      tunnelDetail = error instanceof Error ? error.message : String(error)
      ctx.logger.warn(error)
    })
    return async () => {
      lifecycle.active = false
      await stopAccess()
    }
  }, 'mobile-web: proxy and tunnel')

  ctx.connection.rpc.handle(MOBILE_WEB_CHANNEL, async (endpoint) => {
    try {
      switch (endpoint) {
        case 'status': return ok(await status())
        case 'access.start': await startProxy(); return ok(await status())
        case 'access.stop': await stopAccess(); return ok(await status())
        case 'tunnel.start': await openTunnel(); return ok(await status())
        case 'tunnel.stop':
          tunnel?.stop(); tunnel = undefined; accessToken = token()
          tunnelPhase = 'idle'; tunnelDetail = ''; downloadProgress = null
          return ok(await status())
        default: return fail(`unknown mobile Web endpoint: ${endpoint}`)
      }
    } catch (error) { return fail(error instanceof Error ? error.message : String(error)) }
  }, { authority: 'loopback' })
}
