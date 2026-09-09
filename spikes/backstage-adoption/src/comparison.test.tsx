import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolveTemplateParameters, type ParameterStep } from './backstage/resolve-template.js'
import { extractSchemaFromStep } from './backstage/extract-schema.js'
import { templateYaml, fragmentPath } from './template.js'
import { observeRjsf } from './reference/rjsf.js'
import { observeTexaryn } from './candidate/texaryn.js'
import { toUiHints } from './candidate/ui-hints.js'
import { inputsByStep, type StepInputs } from './inputs.js'
import type { StepObservables } from './observables.js'
import { difference, expected, fieldDivergences, errorDivergences } from './divergences.js'

/**
 * The acceptance test: the same resolved Backstage step, rendered by RJSF and
 * by Texaryn, compared on which fields appear, what the verdict and error
 * pointers are, and what a valid fill submits.
 *
 * The fragment is read from disk here rather than fetched. The HTTP path is
 * what `resolve-template.test.ts` exists to exercise; repeating it for every
 * comparison would only add a socket to each case.
 */
const read = async () => readFileSync(fragmentPath, 'utf8')

let steps: ParameterStep[]

beforeAll(async () => {
  steps = await resolveTemplateParameters(templateYaml, read)
})

interface Prepared {
  title: string
  schema: ReturnType<typeof extractSchemaFromStep>['schema']
  uiSchema: ReturnType<typeof extractSchemaFromStep>['uiSchema']
  inputs: StepInputs
}

function prepare(step: ParameterStep): Prepared {
  const title = String(step.title)
  const { schema, uiSchema } = extractSchemaFromStep(step)
  const inputs = inputsByStep[title]
  if (!inputs) throw new Error(`no fixed inputs defined for step "${title}"`)
  return { title, schema, uiSchema, inputs }
}

async function bothSides(
  prepared: Prepared,
  data: unknown,
): Promise<{ rjsf: StepObservables; texaryn: StepObservables }> {
  const { hints } = toUiHints(prepared.uiSchema)
  return {
    rjsf: observeRjsf(prepared.schema, prepared.uiSchema, data),
    texaryn: await observeTexaryn(prepared.schema, hints, data),
  }
}

const titles = [
  'Basic widgets',
  'Numbers, ranges and toggles',
  'Selects and groups',
  'Dates and files',
  'Nested objects and arrays',
  'Fill in some steps',
  'Catalog and repo pickers',
] as const

describe('every step renders on both sides', () => {
  it.each(titles)('%s', async (title) => {
    const prepared = prepare(steps[titles.indexOf(title)])
    expect(prepared.title).toBe(title)

    const { rjsf, texaryn } = await bothSides(prepared, prepared.inputs.valid)
    expect(rjsf.fields.length, 'RJSF rendered no fields').toBeGreaterThan(0)
    expect(texaryn.fields.length, 'Texaryn rendered no fields').toBeGreaterThan(0)
  })
})

describe('the field set matches RJSF, apart from the recorded divergences', () => {
  it.each(titles)('%s', async (title) => {
    const prepared = prepare(steps[titles.indexOf(title)])
    const { rjsf, texaryn } = await bothSides(prepared, prepared.inputs.valid)

    const divergence = fieldDivergences[title]
    expect(
      {
        rjsfOnly: difference(rjsf.fields, texaryn.fields),
        texarynOnly: difference(texaryn.fields, rjsf.fields),
      },
      divergence?.why ?? 'the field sets should be identical',
    ).toEqual(expected(divergence))
  })
})

describe('the verdict and error pointers match RJSF, apart from the recorded divergences', () => {
  const states = ['empty', 'invalid', 'valid'] as const

  it.each(titles.flatMap((title) => states.map((state) => [title, state] as const)))(
    '%s, %s',
    async (title, state) => {
      const prepared = prepare(steps[titles.indexOf(title)])
      const { rjsf, texaryn } = await bothSides(prepared, prepared.inputs[state])

      // The verdict itself never diverges, so it is asserted flatly. Every
      // difference found was in which violations were listed, not in whether the
      // step accepts the data.
      expect(texaryn.valid, `${title}, ${state}: verdict`).toBe(rjsf.valid)

      const divergence = errorDivergences[`${title}, ${state}`]
      expect(
        {
          rjsfOnly: difference(rjsf.errors, texaryn.errors),
          texarynOnly: difference(texaryn.errors, rjsf.errors),
        },
        divergence?.why ?? 'the error lists should be identical',
      ).toEqual(expected(divergence))
    },
  )
})

describe('a complete valid fill submits the same payload', () => {
  it.each(titles)('%s', async (title) => {
    const prepared = prepare(steps[titles.indexOf(title)])
    const { rjsf, texaryn } = await bothSides(prepared, prepared.inputs.valid)

    expect(texaryn.submitted, 'Texaryn did not submit a valid fill').toBe(true)
    expect(rjsf.submitted, 'RJSF did not submit a valid fill').toBe(true)
    expect(texaryn.payload).toEqual(rjsf.payload)
  })
})

describe('an invalid fill is refused on both sides', () => {
  it.each(titles)('%s', async (title) => {
    const prepared = prepare(steps[titles.indexOf(title)])
    const { rjsf, texaryn } = await bothSides(prepared, prepared.inputs.invalid)

    expect(texaryn.submitted).toBe(rjsf.submitted)
  })
})
