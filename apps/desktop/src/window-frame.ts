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

/** A narrow drag target leaves the application UI and native controls clickable. */
export const WINDOW_DRAG_REGION_CSS = `
:root::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  right: 144px;
  height: 8px;
  z-index: 2147483647;
  -webkit-app-region: drag;
  user-select: none;
}
`

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
