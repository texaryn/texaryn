import { webComponentsAriaConformance } from '../../../../tests/renderer-conformance/web-components-aria-conformance.js'
import { createDefaultRegistry } from '../index.js'

webComponentsAriaConformance({ name: 'default', createRegistry: createDefaultRegistry }) // NOSONAR The shared harness registers this file's tests.
