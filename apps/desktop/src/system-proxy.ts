/** Windows/Chromium proxy-rule adaptation for the supervised Harness backend. */

const PROXY_VARIABLES = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'] as const

/**
 * Convert the first supported Chromium proxy rule into a Node HTTPS proxy variable.
 * @param rules - result returned by Electron `session.resolveProxy()`.
 * @param environment - inherited environment checked before adding a system proxy.
 * @returns a single-variable overlay, or an empty object for direct/unsupported rules.
 */
export function systemProxyEnvironment(
  rules: string,
  environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  if (PROXY_VARIABLES.some(key => (environment[key]?.trim().length ?? 0) > 0)) return {}
  for (const rule of rules.split(';')) {
    const match = /^(PROXY|HTTPS)\s+(.+)$/iu.exec(rule.trim())
    if (match?.[1] === undefined || match[2] === undefined) continue
    const scheme = match[1].toUpperCase() === 'HTTPS' ? 'https' : 'http'
    try {
      const url = new URL(match[2].includes('://') ? match[2] : `${scheme}://${match[2]}`)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue
      return { HTTPS_PROXY: url.href }
    } catch { /* Ignore malformed system rules and continue to DIRECT or another proxy. */ }
  }
  return {}
}
