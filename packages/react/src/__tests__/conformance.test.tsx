import { rendererConformance } from '../../../../tests/renderer-conformance/renderer-conformance.js'
import { createDefaultRegistry } from '../index.js'

rendererConformance({ name: 'default', createRegistry: createDefaultRegistry })
