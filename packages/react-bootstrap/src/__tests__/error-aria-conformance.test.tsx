import { universalAriaConformance } from '../../../../tests/renderer-conformance/universal-aria-conformance.js'
import { descriptionPolicyConformance } from '../../../../tests/renderer-conformance/description-policy-conformance.js'
import { createBootstrapRegistry } from '../index.js'

universalAriaConformance({ name: 'bootstrap', createRegistry: createBootstrapRegistry })
descriptionPolicyConformance({ name: 'bootstrap', createRegistry: createBootstrapRegistry, policy: 'preserve' })
