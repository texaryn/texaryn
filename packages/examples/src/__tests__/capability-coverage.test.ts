import { describe, it, expect } from 'vitest'
import {
  capabilityIds,
  getCapability,
  isCapabilityId,
  requiresExample,
} from '../capabilities.js'
import type { CapabilityId } from '../capabilities.js'
import { examples, examplesCovering } from '../registry.js'
import { formProjectionSupport, matrixCapabilityIds, rowKeywords } from '../support-matrix.js'

describe('capability manifest', () => {
  it('uses namespaced identifiers throughout', () => {
    for (const id of capabilityIds) {
      expect(id, `${id} should be namespaced as domain.category.capability`).toMatch(
        /^[a-z0-9-]+(\.[a-zA-Z0-9-]+)+$/,
      )
    }
  })

  it('says where every capability is proven', () => {
    for (const id of capabilityIds) {
      expect(
        ['projection', 'runtime', 'renderer'],
        `${id} needs a verification layer`,
      ).toContain(getCapability(id).verification)
    }
  })

  // The layer is stable product metadata. Naming a suite instead would tie
  // the public catalog to test file names and refactors.
  it('proves accessibility at the renderer layer while keeping its examples data-only', () => {
    const accessibility = capabilityIds.filter(
      (id) => getCapability(id).category === 'accessibility',
    )
    expect(accessibility.length).toBeGreaterThan(0)

    for (const id of accessibility) {
      expect(getCapability(id).verification, `${id} is proven by a renderer`).toBe('renderer')
      expect(
        requiresExample(id),
        `${id} still needs a data-only example, never an exemption`,
      ).toBe(true)
      expect(examplesCovering(id).length).toBeGreaterThan(0)
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

// The published support matrix is generated from the manifest, so the guide
// cannot claim a keyword that no capability declares. TypeScript already
// rejects an unknown id in a row; these assertions catch the other direction
// and give a message that says what to do about it.
describe('published support matrix', () => {
  it('claims only declared capabilities', () => {
    for (const row of formProjectionSupport) {
      for (const id of row.capabilities) {
        expect(
          isCapabilityId(id),
          `JSON Schema support row "${row.title}" claims "${id}" without a declared capability. Add the capability to packages/examples/src/capabilities.ts before documenting it.`,
        ).toBe(true)
      }
    }
  })

  it('documents every supported schema capability', () => {
    const claimed = new Set<CapabilityId>(matrixCapabilityIds())
    // Dialect support is its own section of the guide rather than a row of the
    // form-projection table, and the type capabilities are named by the rows
    // that use them rather than listed on their own.
    const exempt = (id: CapabilityId) =>
      id.startsWith('schema.dialect.') || id.startsWith('schema.type.')
    const missing = capabilityIds.filter(
      (id) =>
        getCapability(id).category === 'schema' &&
        getCapability(id).status === 'supported' &&
        !exempt(id) &&
        !claimed.has(id),
    )
    expect(
      missing,
      missing
        .map(
          (id) =>
            `Supported capability "${id}" is not present in the JSON Schema support matrix. Add it to a row in packages/examples/src/support-matrix.ts.`,
        )
        .join('\n'),
    ).toEqual([])
  })

  it('resolves keywords per dialect, including where the spelling differs', () => {
    const references = formProjectionSupport.find((row) => row.title === 'Local references')!
    expect(rowKeywords(references, 'draft-07')).toContain('definitions')
    expect(rowKeywords(references, '2020-12')).toContain('$defs')

    // deprecated arrived in 2019-09, so the draft-07 column must not claim it.
    const annotations = formProjectionSupport.find((row) => row.title === 'Field annotations')!
    expect(rowKeywords(annotations, 'draft-07')).not.toContain('deprecated')
    expect(rowKeywords(annotations, '2019-09')).toContain('deprecated')
  })
})
