import { describe, it, expect } from 'vitest'
import {
  capabilityIds,
  getCapability,
  isCapabilityId,
  requiresExample,
} from '../capabilities.js'
import type { CapabilityId } from '../capabilities.js'
import { examples, examplesCovering } from '../registry.js'

describe('capability manifest', () => {
  it('uses namespaced identifiers throughout', () => {
    for (const id of capabilityIds) {
      expect(id, `${id} should be namespaced as domain.category.capability`).toMatch(
        /^[a-z0-9-]+(\.[a-zA-Z0-9-]+)+$/,
      )
    }
  })

  it('requires a written reason whenever an example is waived', () => {
    for (const id of capabilityIds) {
      const capability = getCapability(id)
      if (capability.exampleRequired === false) {
        expect(
          capability.exampleExemptionReason,
          `${id} waives its example and must say why`,
        ).toBeTruthy()
      }
    }
  })

  it('treats a supported capability as needing an example unless it opts out', () => {
    const supported = capabilityIds.filter((id) => getCapability(id).status === 'supported')
    expect(supported.length).toBeGreaterThan(0)
    for (const id of supported) {
      expect(requiresExample(id)).toBe(getCapability(id).exampleRequired !== false)
    }
  })
})

// The two directions need different mechanisms. An example covering an
// unknown identifier is a compile error, and this asserts it at runtime too
// for anything that reaches the registry another way. Coverage in the other
// direction cannot be expressed in the type system at all: the type system
// cannot count.
describe('capability coverage', () => {
  it('every identifier an example covers exists in the manifest', () => {
    for (const example of examples) {
      for (const id of example.covers) {
        expect(isCapabilityId(id), `${example.id} covers unknown capability ${id}`).toBe(true)
      }
    }
  })

  it('every capability that requires an example has at least one', () => {
    const uncovered = capabilityIds
      .filter((id) => requiresExample(id))
      .filter((id) => examplesCovering(id).length === 0)

    expect(uncovered, `capabilities with no example: ${uncovered.join(', ')}`).toEqual([])
  })

  it('reports which example covers each capability', () => {
    const coverage = Object.fromEntries(
      capabilityIds.map((id) => [id, examplesCovering(id).map((e) => e.id)]),
    ) as Record<CapabilityId, string[]>

    expect(coverage['schema.type.string']).toContain('basics-string')
    expect(coverage['schema.array.of-objects']).toContain('basics-array-objects')
  })
})

describe('example registry', () => {
  it('gives every example a unique id', () => {
    const ids = examples.map((example) => example.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every example a title, description and at least one capability', () => {
    for (const example of examples) {
      expect(example.title, `${example.id} needs a title`).toBeTruthy()
      expect(example.description, `${example.id} needs a description`).toBeTruthy()
      expect(example.covers.length, `${example.id} covers nothing`).toBeGreaterThan(0)
    }
  })

  it('gives every example an object schema so it can be rendered as a form', () => {
    for (const example of examples) {
      const schema = example.schema as { type?: string }
      expect(schema.type, `${example.id} should have an object schema`).toBe('object')
    }
  })
})
