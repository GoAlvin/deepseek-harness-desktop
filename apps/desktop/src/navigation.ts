/** URL policy shared by the desktop window and its tests. */

/**
 * Decide whether a top-level navigation stays inside the Harness application.
 * @param target - requested navigation URL.
 * @param harnessOrigin - exact origin assigned to the supervised backend.
 * @param loadingUrl - exact packaged loading document URL.
 * @returns true only for the loading document or the current Harness origin.
 */
export function isAllowedNavigation(target: string, harnessOrigin: string | undefined, loadingUrl: string): boolean {
  if (target === loadingUrl) return true
  if (harnessOrigin === undefined) return false
  try {
    return new URL(target).origin === harnessOrigin
  } catch {
    return false
  }
}

/**
 * Decide whether a denied URL may be opened by the operating system.
 * @param target - denied navigation or popup target.
 * @returns true for ordinary HTTP(S) links and false for local or privileged schemes.
 */
export function isExternalWebUrl(target: string): boolean {
  try {
    const protocol = new URL(target).protocol
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}
