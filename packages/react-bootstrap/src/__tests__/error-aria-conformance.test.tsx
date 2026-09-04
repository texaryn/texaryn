import { ariaConformance } from '../../../../tests/renderer-conformance/aria-conformance.js'
import { createBootstrapRegistry } from '../index.js'

ariaConformance({ name: 'bootstrap', createRegistry: createBootstrapRegistry })
