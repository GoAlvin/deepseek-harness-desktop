/** Mobile Web settings dictionaries. */

export const zh = {
  nav: '手机访问',
  title: '手机浏览器访问',
  intro: '手机打开的就是电脑上的同一个 Harness。二维码包含本次进程的随机访问口令，请勿转发。',
  lan: '局域网',
  lanHint: '手机与电脑连接同一 Wi‑Fi 后扫码。',
  public: '公网访问',
  publicHint: '通过 Cloudflare 临时 HTTPS 隧道访问；重新开启后旧链接立即失效。首次开启会下载约 55 MB 的官方 cloudflared。',
  enableAccess: '开启手机访问',
  disableAccess: '关闭手机访问',
  switching: '正在切换…',
  accessDisabled: '手机访问已关闭。局域网和公网链接均已失效。',
  starting: '正在建立公网隧道…',
  start: '开启公网访问',
  stop: '关闭公网访问',
  copy: '复制链接',
  copied: '已复制',
  loading: '正在准备手机访问…',
  unavailable: '手机访问服务暂不可用。',
  downloadProgress: 'cloudflared 下载进度',
  calculating: '计算中',
  security: '安全提示：获得二维码或链接的人可以操作此 Harness。公网用完后请及时关闭。',
  legal: '开启即会运行 Cloudflare Quick Tunnel；该服务仅适合临时访问，不保证可用性，并受 Cloudflare 条款与隐私政策约束。',
} as const

/** English phone-access dictionary. */
export const en: Record<keyof typeof zh, string> = {
  nav: 'Phone access',
  title: 'Phone browser access',
  intro: 'Your phone opens this same Harness. QR codes contain a random process-lifetime bearer; do not share them.',
  lan: 'Local network',
  lanHint: 'Connect the phone and computer to the same Wi-Fi, then scan.',
  public: 'Public access',
  publicHint: 'Uses a temporary Cloudflare HTTPS tunnel. Reopening invalidates the old link.',
  enableAccess: 'Enable phone access',
  disableAccess: 'Disable phone access',
  switching: 'Switching…',
  accessDisabled: 'Phone access is disabled. Local and public links are invalid.',
  starting: 'Opening the public tunnel…',
  start: 'Enable public access',
  stop: 'Disable public access',
  copy: 'Copy link',
  copied: 'Copied',
  loading: 'Preparing phone access…',
  unavailable: 'Phone access is currently unavailable.',
  downloadProgress: 'cloudflared download progress',
  calculating: 'Calculating',
  security: 'Security: anyone with a QR code or link can control this Harness. Disable public access when finished.',
  legal: 'Enabling runs a Cloudflare Quick Tunnel. It is intended only for temporary access, has no availability guarantee, and is governed by Cloudflare’s terms and privacy policy.',
}

/** Keys owned by the phone-access dictionary namespace. */
export type MobileWebKey = keyof typeof zh
