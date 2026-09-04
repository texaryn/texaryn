import { universalAriaConformance } from '../../../../tests/renderer-conformance/universal-aria-conformance.js'
import { descriptionPolicyConformance } from '../../../../tests/renderer-conformance/description-policy-conformance.js'
import { createMuiRegistry } from '../index.js'

universalAriaConformance({ name: 'mui', createRegistry: createMuiRegistry })
descriptionPolicyConformance({ name: 'mui', createRegistry: createMuiRegistry, policy: 'replace' })
