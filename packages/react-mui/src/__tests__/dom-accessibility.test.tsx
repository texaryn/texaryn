import { rendererDomAccessibilityContract } from '../../../../tests/renderer-conformance/renderer-dom-accessibility-contract.js'
import { reactAdapter } from '../../../../tests/renderer-conformance/adapters/react-adapter.js'
import { createMuiRegistry } from '../index.js'

rendererDomAccessibilityContract({
  adapter: reactAdapter('react-mui', createMuiRegistry),
})
