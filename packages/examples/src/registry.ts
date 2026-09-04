import { getCapability } from './capabilities.js'
import type { CapabilityId } from './capabilities.js'
import type { ExampleCategory, TexarynExample } from './types.js'
import { arrayExamples } from './basics/arrays.js'
import { enumAndRequiredExamples } from './basics/enums-and-required.js'
import { objectExamples } from './basics/objects.js'
import { primitiveExamples } from './basics/primitives.js'
import { anyOfExamples } from './composition/any-of.js'
import { conditionalExamples } from './composition/conditionals.js'
import { oneOfExamples } from './composition/one-of.js'
import { dependencyExamples } from './dependencies/index.js'
import { dialectExamples } from './dialects/index.js'
import { referenceExamples } from './references/local-ref.js'
import { constraintExamples } from './validation/constraints.js'
import { accessibilityExamples } from './accessibility/index.js'
import { runtimeExamples } from './runtime/index.js'
import { uiHintExamples } from './ui-hints/index.js'

export const examples: readonly TexarynExample[] = [
  ...primitiveExamples,
  ...objectExamples,
  ...arrayExamples,
  ...enumAndRequiredExamples,
  ...constraintExamples,
  ...referenceExamples,
  ...conditionalExamples,
  ...oneOfExamples,
  ...anyOfExamples,
  ...dependencyExamples,
  ...dialectExamples,
  ...uiHintExamples,
  ...runtimeExamples,
  ...accessibilityExamples,
]

/** Examples whose semantic proof belongs to the shared renderer conformance suites. */
export function rendererVerifiedExamples(): readonly TexarynExample[] {
  return examples.filter((example) =>
    example.covers.some((id) => getCapability(id).verification === 'renderer'),
  )
}

export function getExample(id: string): TexarynExample | undefined {
  return examples.find((example) => example.id === id)
}

export function examplesByCategory(category: ExampleCategory): readonly TexarynExample[] {
  return examples.filter((example) => example.category === category)
}

export function examplesCovering(capability: CapabilityId): readonly TexarynExample[] {
  return examples.filter((example) => example.covers.includes(capability))
}
