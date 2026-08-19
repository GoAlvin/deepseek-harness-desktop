import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { MobileWebSection } from './MobileWebSection.tsx'
import type { MobileWebSectionInjected } from './MobileWebSection.tsx'
import { en, zh, type MobileWebKey } from './locales.ts'
import { MOBILE_WEB_CHANNEL, type MobileWebStatus } from '../protocol.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'mobileWeb': MobileWebKey }
}

/** Required browser services. */
export const inject = ['slots', 'locale', 'connection']

function unwrap(result: RpcResult<unknown>): MobileWebStatus {
  if (!result.ok) throw new Error(result.error.message)
  return result.value as MobileWebStatus
}

/** Register the loopback-only Phone access settings section. */
export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as ConnectionHandle
  if (!connection.isLoopback) return
  ctx.effect(() => ctx.locale.register('mobileWeb', { zh, en }), 'mobile-web: dictionaries')
  const call = async (endpoint: string): Promise<MobileWebStatus> =>
    unwrap(await connection.rpc.call(MOBILE_WEB_CHANNEL, endpoint, {}))
  const injected = (): MobileWebSectionInjected => ({
    load: () => call('status'),
    startAccess: () => call('access.start'),
    stopAccess: () => call('access.stop'),
    startTunnel: () => call('tunnel.start'),
    stopTunnel: () => call('tunnel.stop'),
  })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'mobile-web', order: 15,
    label: () => ctx.locale.bind('mobileWeb')('nav'), locale: 'mobileWeb', inject: injected,
  }, MobileWebSection))
}
