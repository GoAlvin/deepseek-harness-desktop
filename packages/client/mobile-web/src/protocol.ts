/** Browser-safe mobile Web RPC fields shared by the Host and settings page. */

/** Logical RPC channel owned by mobile Web access. */
export const MOBILE_WEB_CHANNEL = '/mobile-web'

/** Public tunnel lifecycle visible in Settings. */
export type TunnelPhase = 'idle' | 'downloading' | 'starting' | 'ready' | 'error'

/** Observable progress for the optional cloudflared binary download. */
export interface MobileWebDownloadProgress {
  receivedBytes: number
  totalBytes: number | null
  bytesPerSecond: number
}

/** Current phone-access state returned by the Host. */
export interface MobileWebStatus {
  proxyRunning: boolean
  proxyPort: number | null
  lanUrl: string | null
  lanQr: string | null
  tunnelUrl: string | null
  tunnelQr: string | null
  tunnelPhase: TunnelPhase
  tunnelDetail: string
  downloadProgress: MobileWebDownloadProgress | null
}
