export type {
  CapabilityCategory,
  CapabilityDefinition,
  CapabilityId,
  CapabilityStatus,
  Dialect,
  VerificationLayer,
} from './capabilities.js'
export type { SupportRow } from './support-matrix.js'
export {
  dialects,
  formProjectionSupport,
  matrixCapabilityIds,
  rowKeywords,
} from './support-matrix.js'
export {
  capabilities,
  capabilityIds,
  getCapability,
  isCapabilityId,
  requiresExample,
} from './capabilities.js'

export type { ExampleCategory, TexarynExample } from './types.js'
export { pointer } from './types.js'

export {
  examples,
  examplesByCategory,
  examplesCovering,
  getExample,
  rendererVerifiedExamples,
} from './registry.js'
