import { descriptionPolicyConformance } from '../../../../tests/renderer-conformance/description-policy-conformance.js'
import { createBootstrapRegistry } from '../index.js'

descriptionPolicyConformance({ name: 'bootstrap', createRegistry: createBootstrapRegistry, policy: 'preserve' }) // NOSONAR The shared harness registers this file's tests.
