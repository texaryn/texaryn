import { rendererConformance } from '../../../../tests/renderer-conformance/renderer-conformance.js'
import { createBootstrapRegistry } from '../index.js'

rendererConformance({ name: 'bootstrap', createRegistry: createBootstrapRegistry })
