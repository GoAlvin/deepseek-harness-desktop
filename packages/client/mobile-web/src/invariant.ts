/** Package-owned invariant companion for `@deepseek-ai/dsh-client-mobile-web`. */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-mobile-web'

/** Stable companion plugin name. */
export const name = 'client-mobile-web-invariant'
/** Invariant registry dependency. */
export const inject = ['invariants']

/** No runtime invariant: proxy and tunnel lifecycle is verified through its real composition tests. */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Host plugin context.
 * @returns disposer for the registry entry.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
