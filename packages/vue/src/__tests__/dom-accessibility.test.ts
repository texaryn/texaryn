import { rendererDomAccessibilityContract } from '../../../../tests/renderer-conformance/renderer-dom-accessibility-contract.js'
import { vueAdapter } from '../../../../tests/renderer-conformance/adapters/vue-adapter.js'
import { createDefaultRegistry } from '../widgets/default-registry.js'

rendererDomAccessibilityContract({
  adapter: vueAdapter('vue', createDefaultRegistry),
  // All three are cross-binding defects this suite exists to expose. React has
  // them too. Remove each declaration with the fix that closes it.
  knownGaps: ['duplicate-id', 'cross-instance-reference', 'missing-named-group'],
})
