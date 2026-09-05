// Search and grouping over the catalog, kept out of the component so the
// matching rules can be tested directly.
import { examples } from '@texaryn/examples'
import type { ExampleCategory, TexarynExample } from '@texaryn/examples'

// Presentation order for the category headings. Anything not listed still
// appears, after these, so adding a category never silently hides its
// examples from the browser.
const CATEGORY_ORDER: readonly ExampleCategory[] = [
  'basics',
  'objects',
  'arrays',
  'validation',
  'composition',
  'references',
  'dependencies',
  'ui-hints',
  'accessibility',
  'dialects',
  'real-world',
]

export const CATEGORY_LABELS: Record<ExampleCategory, string> = {
  basics: 'Basics',
  objects: 'Objects',
  arrays: 'Arrays',
  validation: 'Validation',
  composition: 'Composition',
  references: 'References',
  dependencies: 'Dependencies',
  'ui-hints': 'UI hints',
  accessibility: 'Accessibility',
  dialects: 'Dialects',
  'real-world': 'Real world',
}

export interface ExampleGroup {
  category: ExampleCategory
  label: string
  examples: readonly TexarynExample[]
}

/** Matches title, description and any capability the example covers. */
export function matchesQuery(example: TexarynExample, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true

  return (
    example.title.toLowerCase().includes(needle) ||
    example.description.toLowerCase().includes(needle) ||
    example.id.toLowerCase().includes(needle) ||
    example.covers.some((capability) => capability.toLowerCase().includes(needle))
  )
}

export function searchExamples(query: string): readonly TexarynExample[] {
  return examples.filter((example) => matchesQuery(example, query))
}

export function groupByCategory(list: readonly TexarynExample[]): ExampleGroup[] {
  const seen = new Map<ExampleCategory, TexarynExample[]>()
  for (const example of list) {
    const bucket = seen.get(example.category) ?? []
    bucket.push(example)
    seen.set(example.category, bucket)
  }

  const known = CATEGORY_ORDER.filter((category) => seen.has(category))
  const unknown = [...seen.keys()].filter((category) => !CATEGORY_ORDER.includes(category))

  return [...known, ...unknown].map((category) => ({
    category,
    label: CATEGORY_LABELS[category] ?? category,
    examples: seen.get(category) ?? [],
  }))
}
