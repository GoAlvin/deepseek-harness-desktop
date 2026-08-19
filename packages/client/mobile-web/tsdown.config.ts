import { clientBundle } from '../tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-client-mobile-web',
  ['lib/types/index.js', 'lib/types/invariant.js'],
  { hostPhase: true },
)
