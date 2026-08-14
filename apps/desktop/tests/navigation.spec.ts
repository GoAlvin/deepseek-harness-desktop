import { describe, expect, it } from 'vitest'
import { isAllowedNavigation, isExternalWebUrl } from '../src/navigation.ts'

describe('desktop navigation policy', () => {
  const loading = 'file:///app/loading.html'
  const origin = 'http://127.0.0.1:4321'

  it('allows only the loading document and the supervised backend origin', () => {
    expect(isAllowedNavigation(loading, undefined, loading)).toBe(true)
    expect(isAllowedNavigation(`${origin}/settings`, origin, loading)).toBe(true)
    expect(isAllowedNavigation('http://127.0.0.1:9999/', origin, loading)).toBe(false)
    expect(isAllowedNavigation('file:///etc/passwd', origin, loading)).toBe(false)
    expect(isAllowedNavigation('not a url', origin, loading)).toBe(false)
  })

  it('sends only ordinary Web links to the operating system', () => {
    expect(isExternalWebUrl('https://example.com/docs')).toBe(true)
    expect(isExternalWebUrl('http://example.com/docs')).toBe(true)
    expect(isExternalWebUrl('file:///etc/passwd')).toBe(false)
    expect(isExternalWebUrl('javascript:alert(1)')).toBe(false)
    expect(isExternalWebUrl('not a url')).toBe(false)
  })
})
