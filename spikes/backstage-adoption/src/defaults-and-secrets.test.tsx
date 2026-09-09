import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolveTemplateParameters } from './backstage/resolve-template.js'
import { extractSchemaFromStep } from './backstage/extract-schema.js'
import { templateYaml, fragmentPath } from './template.js'
import { observeRjsf } from './reference/rjsf.js'
import { observeTexaryn } from './candidate/texaryn.js'
import { toUiHints } from './candidate/ui-hints.js'

const read = async () => readFileSync(fragmentPath, 'utf8')

async function step(title: string) {
  const steps = await resolveTemplateParameters(templateYaml, read)
  const found = steps.find((s) => s.title === title)
  if (!found) throw new Error(`no step titled ${title}`)
  return extractSchemaFromStep(found)
}

/**
 * `default` is where the two sides part company on the submitted payload, and
 * the step comparison does not catch it: those fixtures fill every field, so
 * no default is ever reached. Tested on its own with an empty fill, which is
 * how a person who accepts the form's suggestions actually submits it.
 */
describe('schema defaults', () => {
  it('RJSF submits the defaults and Texaryn submits nothing', async () => {
    const { schema, uiSchema } = await step('Numbers, ranges and toggles')
    const { hints } = toUiHints(uiSchema)

    const rjsf = observeRjsf(schema, uiSchema, {})
    const texaryn = await observeTexaryn(schema, hints, {})

    expect(rjsf.submitted).toBe(true)
    expect(texaryn.submitted).toBe(true)

    // The template declares four defaults on this step.
    expect(rjsf.payload).toEqual({
      replicas: 3,
      confidence: 50,
      enabled: true,
      consent: false,
    })
    expect(texaryn.payload).toEqual({})
  })

  /**
   * The consequence for a Backstage template, which is what makes it more than
   * a difference of philosophy. A scaffolder action reads
   * `${{ parameters.replicas }}`, and the template author wrote `default: 3`
   * to mean "3 unless someone changes it". Through RJSF the action receives 3.
   * Through Texaryn it receives nothing, and every action that consumes a
   * defaulted parameter has to be rewritten to supply the default again.
   *
   * The default is not lost from the form: `AnnotationSet.default` carries it,
   * so a binding could show it. It is absent from the data.
   */
  it('leaves every defaulted parameter out of the submission', async () => {
    const { schema, uiSchema } = await step('Basic widgets')
    const { hints } = toUiHints(uiSchema)

    const texaryn = await observeTexaryn(schema, hints, { name: 'x', email: 'a@b.c' })
    // `secret` declares `default: hidden-default-value` in the template.
    expect(texaryn.payload).toEqual({ name: 'x', email: 'a@b.c' })

    const rjsf = observeRjsf(schema, uiSchema, { name: 'x', email: 'a@b.c' })
    expect(rjsf.payload).toEqual({
      name: 'x',
      email: 'a@b.c',
      secret: 'hidden-default-value',
    })
  })
})

/**
 * Backstage's `ui:widget: hidden` and its `Secret` field extension are the two
 * ways a template says "this is not an ordinary input". Neither survives.
 */
describe('hidden fields and secrets', () => {
  it('renders a hidden field as an ordinary visible input', async () => {
    const { schema, uiSchema } = await step('Basic widgets')
    const { hints } = toUiHints(uiSchema)

    // The template asks for `ui:widget: hidden` on `secret`.
    expect(uiSchema.secret).toEqual({ 'ui:widget': 'hidden' })

    const rjsf = observeRjsf(schema, uiSchema, {})
    const texaryn = await observeTexaryn(schema, hints, {})

    // Both list it as a field; the difference is what the DOM does with it.
    expect(rjsf.fields).toContain('/secret')
    expect(texaryn.fields).toContain('/secret')

    // `FieldHints.hidden` exists but is deprecated and documented as never
    // applied, and `ui:widget: hidden` has no widget to select, so the field
    // renders as a text input. A template using it to carry a value the user
    // should not see instead shows them the value.
    expect(hints['/secret']).toEqual({ widget: 'hidden' })
  })

  /**
   * `ui:field: Secret` means "collect this, send it to the scaffolder's secret
   * store, and keep it out of `parameters`". That is a Backstage rule rather
   * than a form-library feature, so the harness applies it to both sides
   * identically. What the exercise found is that Texaryn has no concept a
   * field can be rendered and yet excluded from the submitted data, so the
   * rule can only be a filter applied after submission.
   */
  it('has no way to render a field and keep it out of the payload', async () => {
    const { schema, uiSchema } = await step('Catalog and repo pickers')
    const { hints } = toUiHints(uiSchema)

    expect(uiSchema.deployToken).toEqual({ 'ui:field': 'Secret' })

    const texaryn = await observeTexaryn(schema, hints, { deployToken: 'shhh' })
    expect(texaryn.fields).toContain('/deployToken')
    // Submitted along with everything else. Splitting it out is the caller's
    // job, after the fact.
    expect(texaryn.payload).toEqual({ deployToken: 'shhh' })

    const { deployToken, ...parameters } = texaryn.payload as { deployToken?: string }
    expect(deployToken).toBe('shhh')
    expect(parameters).toEqual({})
  })
})
