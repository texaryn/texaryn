import { rendererDomAccessibilityContract } from '../../../../tests/renderer-conformance/renderer-dom-accessibility-contract.js'
import { reactAdapter } from '../../../../tests/renderer-conformance/adapters/react-adapter.js'
import { createBootstrapRegistry } from '../index.js'

rendererDomAccessibilityContract({
  adapter: reactAdapter('react-bootstrap', createBootstrapRegistry),
  knownGaps: ['duplicate-id', 'missing-named-group'],
})
