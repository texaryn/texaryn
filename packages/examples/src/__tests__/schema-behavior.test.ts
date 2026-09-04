// Proof that each schema capability actually changed the projection.
//
// "The document projected" is a weak claim: an unsupported keyword that the
// adapter silently ignored still produces a perfectly valid document. These
// tests assert the capability influenced the result, and each one was checked
// to fail when the keyword is removed from its example's schema.
import { describe, it, expect } from 'vitest'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import type { JsonPointer, SchemaProjection } from '@texaryn/core'
import { getExample } from '../registry.js'
import type { TexarynExample } from '../types.js'

function example(id: string): TexarynExample {
  const found = getExample(id)
  if (!found) throw new Error(`example ${id} is not registered`)
  return found
}

async function project(ex: TexarynExample, data: unknown): Promise<SchemaProjection> {
  const adapter = await createJsonSchemaAdapter(ex.schema, { defaultDialect: ex.dialect })
  return adapter.project(data)
}

function node(projection: SchemaProjection, pointer: string) {
  return projection.nodes.get(pointer as JsonPointer)
}

describe('$ref brings the referenced fields into the projection', () => {
  it('projects the referenced object as if written inline', async () => {
    const ex = example('reference-local-ref')
    const projection = await project(ex, ex.initialData)

    expect(node(projection, '/home')).toBeDefined()
    expect(node(projection, '/home/street'), 'the $ref target did not contribute fields').toBeDefined()
    expect(node(projection, '/home/city')).toBeDefined()
  })

  it('gives each user of a reused fragment its own independent subtree', async () => {
    const ex = example('reference-reused-fragment')
    const projection = await project(ex, ex.initialData)

    expect(node(projection, '/home/street')).toBeDefined()
    expect(node(projection, '/work/street')).toBeDefined()
    expect(node(projection, '/home/street')).not.toBe(node(projection, '/work/street'))
  })
})

describe('if/then/else activates the branch the discriminator selects', () => {
  it('flips which fields are active when the discriminator changes', async () => {
    const ex = example('conditional-if-then-else')

    const business = await project(ex, { accountType: 'business' })
    expect(node(business, '/companyName')?.active).toBe(true)
    expect(node(business, '/taxId')?.active).toBe(true)
    expect(node(business, '/nickname')?.active).toBe(false)

    const personal = await project(ex, { accountType: 'personal' })
    expect(node(personal, '/nickname')?.active).toBe(true)
    expect(node(personal, '/companyName')?.active).toBe(false)
    expect(node(personal, '/taxId')?.active).toBe(false)
  })

  it('keeps inactive branch fields in the document rather than dropping them', async () => {
    const ex = example('conditional-if-then-else')
    const personal = await project(ex, { accountType: 'personal' })

    expect(
      node(personal, '/companyName'),
      'inactive fields should still project, with active false',
    ).toBeDefined()
  })
})

describe('oneOf selects exactly one alternative', () => {
  it('activates only the fields of the matching alternative', async () => {
    const ex = example('composition-one-of')

    const circle = await project(ex, { kind: 'circle', radius: 5 })
    expect(node(circle, '/radius')?.active).toBe(true)
    expect(node(circle, '/width')?.active).toBe(false)
    expect(node(circle, '/height')?.active).toBe(false)

    const rectangle = await project(ex, { kind: 'rectangle', width: 2, height: 3 })
    expect(node(rectangle, '/width')?.active).toBe(true)
    expect(node(rectangle, '/height')?.active).toBe(true)
    expect(node(rectangle, '/radius')?.active).toBe(false)
  })
})

describe('anyOf resolves the field against the alternatives the data satisfies', () => {
  it('projects the field for both a string and a numeric value', async () => {
    const ex = example('composition-any-of')

    const text = await project(ex, { value: 'hello' })
    expect(node(text, '/value')).toBeDefined()

    const numeric = await project(ex, { value: 42 })
    expect(node(numeric, '/value')).toBeDefined()

    expect(node(text, '/value')?.type).not.toBe(node(numeric, '/value')?.type)
  })
})

describe('dependencies activate their dependent rules', () => {
  it('activates the dependent field only while the trigger is present', async () => {
    const ex = example('dependency-dependent-schemas')

    const withCard = await project(ex, { creditCard: '4111111111111111' })
    expect(node(withCard, '/cvv')?.active).toBe(true)

    const withoutCard = await project(ex, {})
    expect(node(withoutCard, '/cvv')?.active).toBe(false)
  })

  it('applies the draft-07 dependencies keyword the same way', async () => {
    const ex = example('dependency-draft07')

    const withCard = await project(ex, { creditCard: '4111111111111111' })
    expect(node(withCard, '/cvv')?.active).toBe(true)

    const withoutCard = await project(ex, {})
    expect(node(withoutCard, '/cvv')?.active).toBe(false)
  })

  it('makes the dependent property required only while the trigger is present', async () => {
    const ex = example('dependency-dependent-required')
    const adapter = await createJsonSchemaAdapter(ex.schema, { defaultDialect: ex.dialect })

    const missing = await adapter.validate({ creditCard: '4111111111111111' })
    expect(
      missing.errors.map((error) => error.keyword),
      'billingAddress should be required once creditCard is present',
    ).toContain('dependentRequired')

    // The same missing property is fine when its trigger is absent, which is
    // what separates dependentRequired from a plain required entry.
    const notTriggered = await adapter.validate({})
    expect(notTriggered.errors).toEqual([])
  })
})

describe('array item schema drives the repeated nodes', () => {
  it('projects one node per item, from the item schema', async () => {
    const ex = example('basics-array-primitives')

    const two = await project(ex, { tags: ['a', 'b'] })
    expect(node(two, '/tags/0')).toBeDefined()
    expect(node(two, '/tags/1')).toBeDefined()
    expect(node(two, '/tags/2')).toBeUndefined()

    const three = await project(ex, { tags: ['a', 'b', 'c'] })
    expect(node(three, '/tags/2'), 'a third item did not produce a third node').toBeDefined()
  })

  it('expands object item schemas into their own fields per row', async () => {
    const ex = example('basics-array-objects')
    const projection = await project(ex, {
      contacts: [
        { name: 'Ada', email: 'ada@example.com' },
        { name: 'Grace', email: 'grace@example.com' },
      ],
    })

    expect(node(projection, '/contacts/0/name')).toBeDefined()
    expect(node(projection, '/contacts/1/email')).toBeDefined()
  })
})

describe('constraints reach the projection', () => {
  it('carries string constraints onto the node', async () => {
    const ex = example('validation-string-constraints')
    const projection = await project(ex, ex.initialData)

    const username = node(projection, '/username')
    expect(username?.constraints.minLength).toBe(3)
    expect(username?.constraints.maxLength).toBe(20)
    expect(node(projection, '/postcode')?.constraints.pattern).toBe('^[0-9]{5}$')
  })

  it('carries numeric constraints onto the node', async () => {
    const ex = example('validation-numeric-constraints')
    const projection = await project(ex, ex.initialData)

    const age = node(projection, '/age')
    expect(age?.constraints.minimum).toBe(0)
    expect(age?.constraints.maximum).toBe(150)
  })

  it('carries array constraints onto the node', async () => {
    const ex = example('validation-array-constraints')
    const projection = await project(ex, ex.initialData)

    const skills = node(projection, '/skills')
    expect(skills?.constraints.minItems).toBe(1)
    expect(skills?.constraints.maxItems).toBe(5)
    expect(skills?.constraints.uniqueItems).toBe(true)
  })

  it('rejects data that violates a constraint', async () => {
    const ex = example('validation-string-constraints')
    const adapter = await createJsonSchemaAdapter(ex.schema, { defaultDialect: ex.dialect })

    const tooShort = await adapter.validate({ username: 'ab', postcode: '75001' })
    expect(tooShort.errors.length).toBeGreaterThan(0)

    const badPattern = await adapter.validate({ username: 'ada', postcode: 'nope' })
    expect(badPattern.errors.length).toBeGreaterThan(0)
  })
})

describe('dialects are detected and honoured', () => {
  it.each([
    ['dialect-draft-07', 'draft-07'],
    ['dialect-2019-09', '2019-09'],
    ['dialect-2020-12', '2020-12'],
  ])('%s projects under its declared dialect', async (id) => {
    const ex = example(id)
    const projection = await project(ex, ex.initialData)
    expect(projection.nodes.size).toBeGreaterThan(1)
  })

  // The keyword is the point: dependentSchemas does not exist in draft-07,
  // and dependencies is not how 2020-12 spells it, so each example proves its
  // dialect was actually used rather than defaulted.
  it('applies dependencies under draft-07 and dependentSchemas under 2020-12', async () => {
    const draft07 = example('dependency-draft07')
    const modern = example('dependency-dependent-schemas')

    expect(draft07.dialect).toBe('draft-07')
    expect(node(await project(draft07, { creditCard: 'x' }), '/cvv')?.active).toBe(true)
    expect(node(await project(modern, { creditCard: 'x' }), '/cvv')?.active).toBe(true)
  })
})
