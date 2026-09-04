import { ariaConformance } from '../../../../tests/renderer-conformance/aria-conformance.js'
import { createDefaultRegistry } from '../index.js'

ariaConformance({ name: 'default', createRegistry: createDefaultRegistry })
