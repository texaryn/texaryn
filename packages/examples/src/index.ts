export type {
  CapabilityCategory,
  CapabilityDefinition,
  CapabilityId,
  CapabilityStatus,
  Dialect,
} from './capabilities.js'
export {
  capabilities,
  capabilityIds,
  getCapability,
  isCapabilityId,
  requiresExample,
} from './capabilities.js'

export type { ExampleCategory, TexarynExample } from './types.js'

export {
  examples,
  examplesByCategory,
  examplesCovering,
  getExample,
} from './registry.js'
