/** Authenticated HTTP/WebSocket reverse proxy used by phone browsers. */

import { createServer, request as httpRequest } from 'node:http'
import type { IncomingHttpHeaders, IncomingMessage, Server, ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import type { Duplex } from 'node:stream'

const ACCESS_PARAM = 'dsh_access'
const ACCESS_COOKIE = 'dsh_mobile_access'

/** Live proxy handle owned by the mobile Web plugin. */
export interface MobileProxy {
  readonly port: number
  close(): Promise<void>
}

/** Inputs for the authenticated reverse proxy. */
export interface MobileProxyOptions {
  port: number
  upstreamPort: number
  token: () => string
}

function cookies(header: string | undefined): Record<string, string> {
  const parsed: Record<string, string> = {}
  for (const field of header?.split(';') ?? []) {
    const at = field.indexOf('=')
    if (at <= 0) continue
    parsed[field.slice(0, at).trim()] = field.slice(at + 1).trim()
  }
  return parsed
}

function authorized(req: IncomingMessage, token: string): boolean {
  return cookies(req.headers.cookie)[ACCESS_COOKIE] === token
}

function pairingTarget(req: IncomingMessage, token: string): string | undefined {
  if (req.method !== 'GET') return undefined
  const url = new URL(req.url ?? '/', 'http://mobile.local')
  if (url.searchParams.get(ACCESS_PARAM) !== token) return undefined
  url.searchParams.delete(ACCESS_PARAM)
  return url.pathname + url.search + url.hash
}

function deny(req: IncomingMessage, socketOrResponse: Duplex | ServerResponse): void {
  if ('writeHead' in socketOrResponse) {
    const acceptsHtml = (req.headers.accept ?? '').includes('text/html')
    socketOrResponse.writeHead(401, {
      'cache-control': 'no-store',
      'content-type': acceptsHtml ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
    })
    socketOrResponse.end(acceptsHtml
      ? '<!doctype html><meta name="viewport" content="width=device-width"><title>DeepSeek Harness</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f7fb;color:#172033;font:16px system-ui}.c{max-width:28rem;margin:24px;padding:28px;border:1px solid #dbe2ee;border-radius:20px;background:#fff}h1{font-size:20px}p{line-height:1.6;color:#5f6878}</style><main class="c"><h1>访问链接已失效</h1><p>请回到电脑的“设置 → 手机访问”，重新扫描局域网或公网二维码。</p></main>'
      : '{"error":"unauthorized"}')
    return
  }
  socketOrResponse.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
}

function upstreamHeaders(headers: IncomingHttpHeaders, upstreamPort: number): IncomingHttpHeaders {
  const next = { ...headers, host: `127.0.0.1:${String(upstreamPort)}` }
  if (next.origin !== undefined) next.origin = `http://127.0.0.1:${String(upstreamPort)}`
  return next
}

const UUID_POLYFILL = '<script data-dsh-mobile-web>if(!crypto.randomUUID){crypto.randomUUID=function(){const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=[...b].map(x=>x.toString(16).padStart(2,\'0\')).join(\'\');return h.slice(0,8)+\'-\'+h.slice(8,12)+\'-\'+h.slice(12,16)+\'-\'+h.slice(16,20)+\'-\'+h.slice(20)}};</script>'

/**
 * Start the authenticated all-interface proxy.
 * @param options - listening port, loopback upstream, and current bearer reader.
 * @returns live proxy handle after the port is listening.
 */
export async function createMobileProxy(options: MobileProxyOptions): Promise<MobileProxy> {
  const sockets = new Set<Socket>()
  const server: Server = createServer((req, res) => {
    // Control RPC never crosses the phone-facing proxy. The desktop browser
    // reaches it through the original loopback transport.
    if ((req.url ?? '').startsWith('/mobile-web/')) {
      res.writeHead(403); res.end('forbidden'); return
    }
    const token = options.token()
    const target = pairingTarget(req, token)
    if (target !== undefined) {
      const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''
      res.writeHead(303, {
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'set-cookie': `${ACCESS_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/${secure}`,
        location: target,
      })
      res.end()
      return
    }
    if (!authorized(req, token)) { deny(req, res); return }
    const proxy = httpRequest({
      host: '127.0.0.1', port: options.upstreamPort, method: req.method,
      path: req.url, headers: upstreamHeaders(req.headers, options.upstreamPort), agent: false,
    }, (upstream) => {
      const contentType = upstream.headers['content-type'] ?? ''
      if (contentType.includes('text/html') && upstream.headers['content-encoding'] === undefined) {
        const chunks: Buffer[] = []
        upstream.on('data', (chunk: Uint8Array) => { chunks.push(Buffer.from(chunk)) })
        upstream.on('end', () => {
          const source = Buffer.concat(chunks).toString('utf8')
          const body = source.includes('</head>')
            ? source.replace('</head>', `${UUID_POLYFILL}</head>`)
            : UUID_POLYFILL + source
          const headers = { ...upstream.headers, 'content-length': String(Buffer.byteLength(body)) }
          delete headers['transfer-encoding']
          res.writeHead(upstream.statusCode ?? 200, headers)
          res.end(body)
        })
        upstream.on('error', () => { res.destroy() })
        return
      }
      res.writeHead(upstream.statusCode ?? 200, upstream.headers)
      upstream.pipe(res)
    })
    proxy.on('error', () => {
      if (!res.headersSent) res.writeHead(502)
      res.end('DeepSeek Harness upstream unavailable')
    })
    req.pipe(proxy)
  })

  server.on('upgrade', (req, socket, head) => {
    if ((req.url ?? '').startsWith('/mobile-web/') || !authorized(req, options.token())) {
      deny(req, socket); return
    }
    const proxy = httpRequest({
      host: '127.0.0.1', port: options.upstreamPort, method: req.method,
      path: req.url, headers: upstreamHeaders(req.headers, options.upstreamPort), agent: false,
    })
    proxy.on('upgrade', (response, upstreamSocket, upstreamHead) => {
      const lines = ['HTTP/1.1 101 Switching Protocols']
      for (const [key, value] of Object.entries(response.headers)) {
        if (value !== undefined) lines.push(`${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
      }
      socket.write(lines.join('\r\n') + '\r\n\r\n')
      if (upstreamHead.length > 0) socket.write(upstreamHead)
      upstreamSocket.pipe(socket).pipe(upstreamSocket)
    })
    proxy.on('response', (response) => {
      socket.end(`HTTP/1.1 ${String(response.statusCode ?? 502)} Rejected\r\nConnection: close\r\n\r\n`)
      response.resume()
    })
    proxy.on('error', () => { socket.destroy() })
    if (head.length > 0) proxy.write(head)
    proxy.end()
  })

  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.once('close', () => { sockets.delete(socket) })
    socket.on('error', () => {})
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, '0.0.0.0', () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('mobile-web proxy did not publish a TCP port')
  return {
    port: address.port,
    close: () => new Promise<void>((resolve) => {
      for (const socket of sockets) socket.destroy()
      server.close(() => { resolve() })
    }),
  }
}
