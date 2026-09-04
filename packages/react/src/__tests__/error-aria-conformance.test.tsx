import { universalAriaConformance } from '../../../../tests/renderer-conformance/universal-aria-conformance.js'
import { descriptionPolicyConformance } from '../../../../tests/renderer-conformance/description-policy-conformance.js'
import { createDefaultRegistry } from '../index.js'

universalAriaConformance({ name: 'default', createRegistry: createDefaultRegistry })
descriptionPolicyConformance({ name: 'default', createRegistry: createDefaultRegistry, policy: 'preserve' })
