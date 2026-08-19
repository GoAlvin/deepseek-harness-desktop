import { useEffect, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MobileWebStatus } from '../protocol.ts'
import css from './MobileWebSection.module.css'

/** Injected actions used by the phone-access settings section. */
export interface MobileWebSectionInjected {
  load: () => Promise<MobileWebStatus>
  startAccess: () => Promise<MobileWebStatus>
  stopAccess: () => Promise<MobileWebStatus>
  startTunnel: () => Promise<MobileWebStatus>
  stopTunnel: () => Promise<MobileWebStatus>
}

/** Complete settings-section props. */
export type MobileWebSectionProps = PropsRuntime<'settings.section'> & PropsLocale<'mobileWeb'> & MobileWebSectionInjected

/** Format a byte count for the compact progress readout. */
function size(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** LAN and public phone-access controls. */
export function MobileWebSection({ load, startAccess, stopAccess, startTunnel, stopTunnel, t }: MobileWebSectionProps) {
  const [status, setStatus] = useState<MobileWebStatus | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [accessBusy, setAccessBusy] = useState(false)
  const [copied, setCopied] = useState('')

  useEffect(() => {
    let active = true
    const refresh = async (): Promise<void> => {
      try {
        const next = await load()
        if (active) { setStatus(next); setError('') }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : String(cause))
      }
    }
    void refresh()
    const timer = setInterval(() => { void refresh() }, 3000)
    return () => { active = false; clearInterval(timer) }
  }, [load])

  const act = async (operation: () => Promise<MobileWebStatus>): Promise<void> => {
    setBusy(true)
    setError('')
    try { setStatus(await operation()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  const copy = async (label: string, value: string): Promise<void> => {
    await navigator.clipboard.writeText(value)
    setCopied(label)
    setTimeout(() => { setCopied('') }, 1500)
  }
  const lanUrl = status?.lanUrl ?? null
  const tunnelUrl = status?.tunnelUrl ?? null
  const progress = status?.downloadProgress ?? null
  const progressPercent = progress?.totalBytes === null || progress === null
    ? null
    : Math.min(100, Math.round(progress.receivedBytes / progress.totalBytes * 100))
  const toggleAccess = async (): Promise<void> => {
    setAccessBusy(true)
    setError('')
    try { setStatus(await (status?.proxyRunning === true ? stopAccess() : startAccess())) }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setAccessBusy(false) }
  }

  return (
    <section className={css.section}>
      <div className={css.headRow}>
        <div className={css.head}><h2>{t('title')}</h2><p>{t('intro')}</p></div>
        {status !== null && <button
          className={status.proxyRunning ? css.button : css.primary}
          disabled={accessBusy}
          onClick={() => { void toggleAccess() }}
        >
          {accessBusy ? t('switching') : status.proxyRunning ? t('disableAccess') : t('enableAccess')}
        </button>}
      </div>
      {status === null && error === '' && <p className={css.status}>{t('loading')}</p>}
      {error !== '' && <p className={`${css.status} ${css.error}`} role="alert">{t('unavailable')} {error}</p>}
      {status !== null && !status.proxyRunning && <p className={css.disabled}>{t('accessDisabled')}</p>}
      {status !== null && status.proxyRunning && (
        <div className={css.grid}>
          <article className={css.card}>
            <h3>{t('lan')}</h3><p className={css.hint}>{t('lanHint')}</p>
            {status.lanQr !== null && <img className={css.qr} src={status.lanQr} alt="LAN QR" />}
            {lanUrl !== null && <>
              <code className={css.url} title={lanUrl}>{lanUrl}</code>
              <div className={css.actions}>
                <button className={css.button} onClick={() => { void copy('lan', lanUrl) }}>
                  {copied === 'lan' ? t('copied') : t('copy')}
                </button>
              </div>
            </>}
          </article>
          <article className={css.card}>
            <h3>{t('public')}</h3><p className={css.hint}>{t('publicHint')}</p>
            {status.tunnelQr !== null && <img className={css.qr} src={status.tunnelQr} alt="Public access QR" />}
            {tunnelUrl !== null && <code className={css.url} title={tunnelUrl}>{tunnelUrl}</code>}
            <div className={css.actions}>
              {tunnelUrl === null
                ? <button className={css.primary} disabled={busy} onClick={() => { void act(startTunnel) }}>{busy || status.tunnelPhase === 'starting' || status.tunnelPhase === 'downloading' ? t('starting') : t('start')}</button>
                : <>
                  <button className={css.button} onClick={() => { void copy('public', tunnelUrl) }}>{copied === 'public' ? t('copied') : t('copy')}</button>
                  <button className={css.button} disabled={busy} onClick={() => { void act(stopTunnel) }}>{t('stop')}</button>
                </>}
            </div>
            {status.tunnelDetail !== '' && <p className={css.status}>{status.tunnelDetail}</p>}
            {status.tunnelPhase === 'downloading' && progress !== null && <div className={css.download}>
              <progress className={css.progress} max={100} value={progressPercent ?? undefined} aria-label={t('downloadProgress')} />
              <div className={css.progressText}>
                <span>{size(progress.receivedBytes)}{progress.totalBytes === null ? '' : ` / ${size(progress.totalBytes)}`}</span>
                <span>{progressPercent === null ? t('calculating') : `${String(progressPercent)}%`} · {size(progress.bytesPerSecond)}/s</span>
              </div>
            </div>}
          </article>
        </div>
      )}
      <p className={css.warning}>{t('security')}</p>
      <p className={css.legal}>
        {t('legal')} <a href="https://www.cloudflare.com/terms/" target="_blank" rel="noreferrer">Terms</a>
        {' · '}
        <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Privacy</a>
      </p>
    </section>
  )
}
