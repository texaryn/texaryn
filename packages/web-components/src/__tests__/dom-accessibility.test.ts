import { rendererDomAccessibilityContract } from '../../../../tests/renderer-conformance/renderer-dom-accessibility-contract.js'
import { webComponentsAdapter } from '../../../../tests/renderer-conformance/adapters/web-components-adapter.js'
import { createDefaultRegistry } from '../index.js'

rendererDomAccessibilityContract({ // NOSONAR The shared harness registers this file's tests.
  adapter: webComponentsAdapter('web-components', createDefaultRegistry),
})
