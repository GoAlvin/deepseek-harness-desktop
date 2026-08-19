import type { BrowserWindowConstructorOptions } from 'electron'

/** The Windows control overlay replaces the native title bar without a renderer bridge. */
export const WINDOWS_TITLE_BAR_OPTIONS = {
  titleBarStyle: 'hidden',
  titleBarOverlay: {
    color: '#00000000',
    symbolColor: '#172033',
    height: 36,
  },
} as const satisfies Pick<BrowserWindowConstructorOptions, 'titleBarStyle' | 'titleBarOverlay'>

/** Windows renderer CSS reserves the control overlay and exposes its draggable area. */
export const WINDOWS_FRAME_CSS = `
:root {
  --dsh-desktop-titlebar-height: env(titlebar-area-height, 36px);
}

body {
  box-sizing: border-box;
  padding-top: var(--dsh-desktop-titlebar-height);
}

:root::before {
  content: '';
  position: fixed;
  top: env(titlebar-area-y, 0px);
  left: env(titlebar-area-x, 0px);
  width: env(titlebar-area-width, calc(100% - 144px));
  height: var(--dsh-desktop-titlebar-height);
  z-index: 2147483647;
  -webkit-app-region: drag;
  user-select: none;
}
`

/**
 * Select renderer CSS for the platform's hidden-title treatment.
 *
 * @param platform - Node's current operating-system identifier.
 * @returns CSS that reserves the Windows controls overlay, or no CSS elsewhere.
 */
export function windowFrameCss(platform: NodeJS.Platform): string {
  return platform === 'win32' ? WINDOWS_FRAME_CSS : ''
}

/**
 * Select the platform-native title-bar treatment.
 *
 * @param platform - Node's current operating-system identifier.
 * @returns BrowserWindow options that remove the ordinary title row.
 */
export function windowFrameOptions(platform: NodeJS.Platform): Pick<BrowserWindowConstructorOptions, 'titleBarStyle' | 'titleBarOverlay'> | Pick<BrowserWindowConstructorOptions, 'titleBarStyle'> {
  if (platform === 'win32') return WINDOWS_TITLE_BAR_OPTIONS
  if (platform === 'darwin') return { titleBarStyle: 'hiddenInset' }
  return { titleBarStyle: 'hidden' }
}
