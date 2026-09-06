import { rendererDomAccessibilityContract } from '../../../../tests/renderer-conformance/renderer-dom-accessibility-contract.js'
import { reactAdapter } from '../../../../tests/renderer-conformance/adapters/react-adapter.js'
import { createDefaultRegistry } from '../index.js'

rendererDomAccessibilityContract({
  adapter: reactAdapter('react-default', createDefaultRegistry),
  // Remove each declaration with the fix that closes it.
  knownGaps: ['missing-named-group'],
})
