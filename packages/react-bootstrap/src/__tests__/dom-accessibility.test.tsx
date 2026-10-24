import { rendererDomAccessibilityContract } from '../../../../tests/renderer-conformance/renderer-dom-accessibility-contract.js'
import { reactAdapter } from '../../../../tests/renderer-conformance/adapters/react-adapter.js'
import { createBootstrapRegistry } from '../index.js'

rendererDomAccessibilityContract({ // NOSONAR The shared harness registers this file's tests.
  adapter: reactAdapter('react-bootstrap', createBootstrapRegistry),
})
