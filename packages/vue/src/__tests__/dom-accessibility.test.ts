import { rendererDomAccessibilityContract } from '../../../../tests/renderer-conformance/renderer-dom-accessibility-contract.js'
import { vueAdapter } from '../../../../tests/renderer-conformance/adapters/vue-adapter.js'
import { createDefaultRegistry } from '../widgets/default-registry.js'

rendererDomAccessibilityContract({
  adapter: vueAdapter('vue', createDefaultRegistry),
})
