import { descriptionPolicyConformance } from '../../../../tests/renderer-conformance/description-policy-conformance.js'
import { createMuiRegistry } from '../index.js'

descriptionPolicyConformance({ name: 'mui', createRegistry: createMuiRegistry, policy: 'replace' })
