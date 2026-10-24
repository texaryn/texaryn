import { descriptionPolicyConformance } from '../../../../tests/renderer-conformance/description-policy-conformance.js'
import { createDefaultRegistry } from '../index.js'

descriptionPolicyConformance({ name: 'default', createRegistry: createDefaultRegistry, policy: 'preserve' }) // NOSONAR The shared harness registers this file's tests.
