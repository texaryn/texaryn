import type { CapabilityId } from './capabilities.js'
import type { ExampleCategory, TexarynExample } from './types.js'
import { arrayExamples } from './basics/arrays.js'
import { enumAndRequiredExamples } from './basics/enums-and-required.js'
import { objectExamples } from './basics/objects.js'
import { primitiveExamples } from './basics/primitives.js'

export const examples: readonly TexarynExample[] = [
  ...primitiveExamples,
  ...objectExamples,
  ...arrayExamples,
  ...enumAndRequiredExamples,
]

export function getExample(id: string): TexarynExample | undefined {
  return examples.find((example) => example.id === id)
}

export function examplesByCategory(category: ExampleCategory): readonly TexarynExample[] {
  return examples.filter((example) => example.category === category)
}

export function examplesCovering(capability: CapabilityId): readonly TexarynExample[] {
  return examples.filter((example) => example.covers.includes(capability))
}
