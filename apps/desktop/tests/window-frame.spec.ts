import { describe, expect, it } from 'vitest'
import { WINDOWS_TITLE_BAR_OPTIONS, WINDOW_DRAG_REGION_CSS, windowFrameOptions } from '../src/window-frame.ts'

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

  it('keeps the drag target narrow and clear of the native control buttons', () => {
    expect(WINDOW_DRAG_REGION_CSS).toContain('-webkit-app-region: drag')
    expect(WINDOW_DRAG_REGION_CSS).toContain('height: 8px')
    expect(WINDOW_DRAG_REGION_CSS).toContain('right: 144px')
  })
})
