// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { render, fireEvent, cleanup } from '@testing-library/react'
import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import type { RJSFSchema } from '@rjsf/utils'

/**
 * What RJSF actually does with `default`, measured rather than assumed.
 *
 * Texaryn projects `default` as an annotation and never applies it, so an
 * untouched Backstage step submits `{}`. Before deciding whether Texaryn needs
 * an initialization facility, the question is what the behaviour being compared
 * against really is: a genuine adoption requirement, or an RJSF convenience to
 * document rather than imitate.
 *
 * The observable is the submitted payload, because that is what a scaffolder
 * action reads. RJSF is pinned at 5.24.13, the version
 * `plugins/scaffolder-react` pins.
 */
function measure(
  schema: unknown,
  formData?: unknown,
): { payload: unknown; revealedValue: string | undefined } {
  let payload: unknown
  const { container } = render(
    createElement(Form, {
      schema: schema as RJSFSchema,
      validator,
      formData,
      onSubmit: ({ formData: submitted }) => {
        payload = submitted
      },
      onError: () => {},
    }),
  )
  const revealed = container.querySelector<HTMLInputElement>('#root_revealed')
  const revealedValue = revealed?.value
  const form = container.querySelector('form')
  if (!form) throw new Error('RJSF rendered no form')
  fireEvent.submit(form)
  cleanup()
  return { payload, revealedValue }
}

function live(schema: unknown) {
  let latest: unknown
  const { container } = render(
    createElement(Form, {
      schema: schema as RJSFSchema,
      validator,
      onChange: ({ formData }) => {
        latest = formData
      },
      onError: () => {},
    }),
  )
  return {
    flag: () => container.querySelector<HTMLInputElement>('#root_flag')!,
    revealed: () => container.querySelector<HTMLInputElement>('#root_revealed'),
    data: () => latest,
    done: () => cleanup(),
  }
}

function submittedPayload(schema: unknown, formData?: unknown): unknown {
  return measure(schema, formData).payload
}

describe('what RJSF does with default', () => {
  it('fills a missing scalar', () => {
    expect(
      submittedPayload({
        type: 'object',
        properties: { replicas: { type: 'integer', default: 3 } },
      }),
    ).toEqual({ replicas: 3 })
  })

  it('does not overwrite a value the caller supplied', () => {
    expect(
      submittedPayload(
        { type: 'object', properties: { replicas: { type: 'integer', default: 3 } } },
        { replicas: 9 },
      ),
    ).toEqual({ replicas: 9 })
  })

  /** The falsy cases, where "absent" and "present but empty" are easy to conflate. */
  it.each([
    ['false', { type: 'boolean', default: true }, { flag: false }, { flag: false }],
    ['zero', { type: 'integer', default: 3 }, { flag: 0 }, { flag: 0 }],
    ['empty string', { type: 'string', default: 'x' }, { flag: '' }, { flag: '' }],
    ['null', { type: ['string', 'null'], default: 'x' }, { flag: null }, { flag: null }],
  ])('keeps an explicit %s rather than defaulting over it', (_label, property, given, expected) => {
    expect(
      submittedPayload({ type: 'object', properties: { flag: property } }, given),
    ).toEqual(expected)
  })

  it('fills a child default when the parent object is missing', () => {
    expect(
      submittedPayload({
        type: 'object',
        properties: {
          owner: { type: 'object', properties: { team: { type: 'string', default: 'platform' } } },
        },
      }),
    ).toEqual({ owner: { team: 'platform' } })
  })

  /**
   * Measured rather than assumed, and not what I expected: an object-level
   * `default` on a property whose own `properties` declare none is simply not
   * applied. So the reference implementation fills from property declarations
   * and ignores the container's.
   */
  it('ignores an object-level default', () => {
    expect(
      submittedPayload({
        type: 'object',
        properties: { owner: { type: 'object', default: { team: 'from-object' } } },
      }),
    ).toEqual({})
  })

  it('prefers the property declaration when both speak about one location', () => {
    expect(
      submittedPayload({
        type: 'object',
        properties: {
          owner: {
            type: 'object',
            default: { team: 'from-object' },
            properties: { team: { type: 'string', default: 'from-property' } },
          },
        },
      }),
    ).toEqual({ owner: { team: 'from-property' } })
  })

  /**
   * Arrays. An item default alone creates nothing, because there is no row to
   * apply it to; `minItems` is what makes rows appear, and each is then filled
   * from the item default. That last one is a convenience of the reference
   * rather than anything JSON Schema asks for: `minItems` constrains an
   * instance and does not describe one.
   */
  it.each([
    ['a declared array default is used as given', { type: 'array', default: ['a'], items: { type: 'string' } }, { list: ['a'] }],
    ['an empty array default stays empty', { type: 'array', default: [], items: { type: 'string' } }, { list: [] }],
    ['item defaults alone create no rows', { type: 'array', items: { type: 'string', default: 'i' } }, { list: [] }],
    ['minItems creates rows and fills them', { type: 'array', minItems: 2, items: { type: 'string', default: 'i' } }, { list: ['i', 'i'] }],
  ])('%s', (_label, property, expected) => {
    expect(submittedPayload({ type: 'object', properties: { list: property } })).toEqual(expected)
  })

  /**
   * The conditional cases, which are the reason this file exists.
   *
   * The first three look self-contradictory: with no `formData` the `then`
   * branch's default is applied even though `flag` is `false` and the branch
   * does not apply, and with `formData: { flag: false }` it is not. The fourth
   * explains it. `if` here constrains `properties` without `required`, so an
   * absent `flag` satisfies it vacuously; adding `required: ['flag']` makes the
   * `if` fail and the default disappear. So `{}` and `{ flag: false }` really
   * are different instances to this `if`, and the reference is consistent.
   *
   * What it is instead is stale, which the last case shows: the branch decision
   * is taken against the data as the caller supplied it, before unconditional
   * defaults are filled, and it is not retaken afterwards.
   */
  const branchOn = (flagDefault: boolean, requireFlag: boolean) => ({
    type: 'object',
    properties: { flag: { type: 'boolean', default: flagDefault } },
    allOf: [
      {
        if: {
          properties: { flag: { const: true } },
          ...(requireFlag ? { required: ['flag'] } : {}),
        },
        then: { properties: { revealed: { type: 'string', default: 'appeared' } } },
      },
    ],
  })

  it('fills a branch default the absent discriminator satisfies vacuously', () => {
    expect(submittedPayload(branchOn(false, false))).toEqual({
      flag: false,
      revealed: 'appeared',
    })
  })

  it('does not fill it once the discriminator is present and fails the if', () => {
    expect(submittedPayload(branchOn(false, false), { flag: false })).toEqual({ flag: false })
  })

  it('fills it when the discriminator is present and passes', () => {
    expect(submittedPayload(branchOn(false, false), { flag: true })).toEqual({
      flag: true,
      revealed: 'appeared',
    })
  })

  it('stops filling it when required makes the absent discriminator fail the if', () => {
    expect(submittedPayload(branchOn(false, true))).toEqual({ flag: false })
  })

  /**
   * The staleness, in one case. `flag` defaults to `true`, so the branch does
   * apply to the instance the form starts from: the field is rendered, because
   * rendering resolves the schema against the current data. Its own default is
   * still never applied, because the default pass ran earlier against data
   * where `flag` was absent and the `if` failed. A visible field with a
   * declared default and an empty value is not a behaviour to reproduce.
   */
  it('renders a branch field whose default it never applied', () => {
    const schema = branchOn(true, true)
    const { payload, revealedValue } = measure(schema)
    expect(payload).toEqual({ flag: true })
    expect(revealedValue).toBe('')
  })

  /**
   * The transition, which is what makes the case above a defect rather than a
   * design position. Activating the same branch by clicking the discriminator
   * does apply the field's default, so the reference is willing to fill a
   * default after the form exists. It only fails to when the activation came
   * from the discriminator's own default instead of from a click.
   */
  it('applies a branch default when the user activates the branch', () => {
    const h = live(branchOn(false, true))
    expect(h.revealed()).toBeNull()
    fireEvent.click(h.flag())
    expect(h.revealed()?.value).toBe('appeared')
    h.done()
  })

  /**
   * Why a cleared field is not refilled, which is not the reason it first
   * appears to be.
   *
   * Clearing the input leaves the key in place with the value `undefined`, and
   * deactivating the branch does not remove it either. The default is then never
   * reapplied because a present key beats a default, so nothing here is
   * tracking that the location was already filled once. `JSON.stringify` drops
   * an `undefined` value, which is what makes the submitted payload look as
   * though the key had gone.
   *
   * This matters beyond defaults: a value typed into a branch that is then
   * deactivated stays in the data and reaches the submission, so a scaffolder
   * action can read a parameter from a branch the form no longer applies.
   */
  it('keeps a cleared key present as undefined, which is why no default returns', () => {
    const h = live(branchOn(false, true))
    fireEvent.click(h.flag())
    expect(h.data()).toEqual({ flag: true, revealed: 'appeared' })

    fireEvent.change(h.revealed()!, { target: { value: '' } })
    fireEvent.click(h.flag())
    fireEvent.click(h.flag())

    const data = h.data() as Record<string, unknown>
    expect('revealed' in data).toBe(true)
    expect(data.revealed).toBeUndefined()
    expect(h.revealed()?.value).toBe('')
    h.done()
  })

  it('submits a value typed into a branch that is no longer active', () => {
    const h = live(branchOn(false, true))
    fireEvent.click(h.flag())
    fireEvent.change(h.revealed()!, { target: { value: 'typed' } })
    fireEvent.click(h.flag())

    expect(h.revealed()).toBeNull()
    expect(h.data()).toEqual({ flag: false, revealed: 'typed' })
    h.done()
  })
})
