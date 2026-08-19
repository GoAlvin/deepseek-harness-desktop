import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { createMobileProxy, type MobileProxy } from '../src/proxy.ts'

const closers: Array<() => Promise<void>> = []

afterEach(async () => {
  while (closers.length > 0) await closers.pop()?.()
})

async function upstream(): Promise<{ port: number; requests: Array<{ host: string; origin: string }> }> {
  const requests: Array<{ host: string; origin: string }> = []
  const server = createServer((request, response) => {
    requests.push({ host: request.headers.host ?? '', origin: request.headers.origin ?? '' })
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end('<!doctype html><html><head><title>Harness</title></head><body>ready</body></html>')
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { resolve() })
  })
  closers.push(() => new Promise<void>((resolve) => { server.close(() => { resolve() }) }))
  return { port: (server.address() as AddressInfo).port, requests }
}

async function proxyFor(upstreamPort: number, readToken: () => string): Promise<MobileProxy> {
  const proxy = await createMobileProxy({ port: 0, upstreamPort, token: readToken })
  closers.push(() => proxy.close())
  return proxy
}

describe('mobile Web proxy', () => {
  it('exchanges the pairing token for a private cookie and rewrites upstream authority', async () => {
    const target = await upstream()
    const token = 'pairing-token'
    const proxy = await proxyFor(target.port, () => token)
    const origin = `http://127.0.0.1:${String(proxy.port)}`

    const denied = await fetch(origin, { redirect: 'manual' })
    expect(denied.status).toBe(401)

    const paired = await fetch(`${origin}/?dsh_access=${token}`, {
      headers: { 'x-forwarded-proto': 'https' },
      redirect: 'manual',
    })
    expect(paired.status).toBe(303)
    expect(paired.headers.get('location')).toBe('/')
    const cookie = paired.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain('Secure')
    expect(cookie).not.toContain('dsh_access')

    const page = await fetch(origin, {
      headers: { cookie: cookie.split(';', 1)[0] ?? '', origin: 'https://phone.example' },
    })
    expect(page.status).toBe(200)
    expect(await page.text()).toContain('data-dsh-mobile-web')
    expect(target.requests).toEqual([{
      host: `127.0.0.1:${String(target.port)}`,
      origin: `http://127.0.0.1:${String(target.port)}`,
    }])
  })

  it('keeps control RPC private and invalidates cookies after token rotation', async () => {
    const target = await upstream()
    let token = 'first-token'
    const proxy = await proxyFor(target.port, () => token)
    const origin = `http://127.0.0.1:${String(proxy.port)}`
    const paired = await fetch(`${origin}/?dsh_access=${token}`, { redirect: 'manual' })
    const cookie = (paired.headers.get('set-cookie') ?? '').split(';', 1)[0] ?? ''

    const control = await fetch(`${origin}/mobile-web/status`, { headers: { cookie } })
    expect(control.status).toBe(403)
    token = 'second-token'
    const stale = await fetch(origin, { headers: { cookie } })
    expect(stale.status).toBe(401)
  })
})
