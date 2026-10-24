import { rendererConformance } from '../../../../tests/renderer-conformance/renderer-conformance.js'
import { createMuiRegistry } from '../index.js'

rendererConformance({ name: 'mui', createRegistry: createMuiRegistry }) // NOSONAR The shared harness registers this file's tests.
