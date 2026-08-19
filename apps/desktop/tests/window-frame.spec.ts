import { describe, expect, it } from 'vitest'
import { WINDOWS_FRAME_CSS, WINDOWS_TITLE_BAR_OPTIONS, windowFrameCss, windowFrameOptions } from '../src/window-frame.ts'

describe('desktop window frame', () => {
  it('replaces the Windows title bar with the native controls overlay', () => {
    expect(windowFrameOptions('win32')).toEqual(WINDOWS_TITLE_BAR_OPTIONS)
    expect(WINDOWS_TITLE_BAR_OPTIONS).toMatchObject({
      titleBarStyle: 'hidden',
      titleBarOverlay: { height: 36 },
    })
  })

  it('uses native hidden-title variants on other desktop platforms', () => {
    expect(windowFrameOptions('darwin')).toEqual({ titleBarStyle: 'hiddenInset' })
    expect(windowFrameOptions('linux')).toEqual({ titleBarStyle: 'hidden' })
  })

  it('reserves the Windows overlay and uses its reported draggable rectangle', () => {
    expect(windowFrameCss('win32')).toBe(WINDOWS_FRAME_CSS)
    expect(WINDOWS_FRAME_CSS).toContain('padding-top: var(--dsh-desktop-titlebar-height)')
    expect(WINDOWS_FRAME_CSS).toContain('env(titlebar-area-height, 36px)')
    expect(WINDOWS_FRAME_CSS).toContain('env(titlebar-area-x, 0px)')
    expect(WINDOWS_FRAME_CSS).toContain('env(titlebar-area-width, calc(100% - 144px))')
    expect(WINDOWS_FRAME_CSS).toContain('-webkit-app-region: drag')
  })

  it('does not apply Windows control dimensions on other platforms', () => {
    expect(windowFrameCss('darwin')).toBe('')
    expect(windowFrameCss('linux')).toBe('')
  })
})
