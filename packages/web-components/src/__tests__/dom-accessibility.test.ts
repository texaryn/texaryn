import { rendererDomAccessibilityContract } from '../../../../tests/renderer-conformance/renderer-dom-accessibility-contract.js'
import { webComponentsAdapter } from '../../../../tests/renderer-conformance/adapters/web-components-adapter.js'
import { createDefaultRegistry } from '../index.js'

rendererDomAccessibilityContract({
  adapter: webComponentsAdapter('web-components', createDefaultRegistry),
})
