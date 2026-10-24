import { rendererDomAccessibilityContract } from '../../../../tests/renderer-conformance/renderer-dom-accessibility-contract.js'
import { reactAdapter } from '../../../../tests/renderer-conformance/adapters/react-adapter.js'
import { createMuiRegistry } from '../index.js'

rendererDomAccessibilityContract({ // NOSONAR The shared harness registers this file's tests.
  adapter: reactAdapter('react-mui', createMuiRegistry),
})
