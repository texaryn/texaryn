import { createElement } from 'react'
import { render, fireEvent, cleanup } from '@testing-library/react'
import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import type { RJSFSchema, UiSchema as RjsfUiSchema } from '@rjsf/utils'
import type { JsonObject } from '../backstage/extract-schema.js'
import {
  canonicalError,
  pointerFromRjsfProperty,
  sortUnique,
  type StepObservables,
} from '../observables.js'

/**
 * RJSF names an input `root_owner_displayName`, so a pointer is recovered by
 * dropping `root` and turning separators into slashes. Ambiguous if a property
 * name contains an underscore, which is why `assertNoUnderscores` runs over
 * every schema before this is trusted rather than leaving the assumption
 * implicit.
 */
function pointerFromRjsfName(name: string): string | null {
  if (!name.startsWith('root')) return null
  const rest = name.slice('root'.length)
  if (rest === '') return ''
  if (!rest.startsWith('_')) return null
  return rest.replace(/_/g, '/')
}

/** Fails loudly if the underscore mapping above could be ambiguous. */
export function assertNoUnderscores(schema: unknown, at = ''): void {
  if (Array.isArray(schema)) {
    schema.forEach((entry, index) => assertNoUnderscores(entry, `${at}/${index}`))
    return
  }
  if (typeof schema !== 'object' || schema === null) return
  const node = schema as JsonObject
  if (typeof node.properties === 'object' && node.properties !== null) {
    for (const key of Object.keys(node.properties)) {
      if (key.includes('_')) {
        throw new Error(
          `Property name "${key}" at ${at} contains an underscore, which makes RJSF's ` +
            'input names ambiguous to map back to JSON pointers.',
        )
      }
    }
  }
  for (const [key, value] of Object.entries(node)) assertNoUnderscores(value, `${at}/${key}`)
}

/**
 * A radio group or a checkbox group renders one input per option, all sharing
 * the field's name, and an option's own id carries a `-0` suffix. The field is
 * what is being counted, so options collapse onto it.
 */
function fieldNames(container: HTMLElement): string[] {
  const inputs = Array.from(container.querySelectorAll('input, select, textarea'))
  return inputs
    .map((element) => (element as HTMLInputElement).name)
    .filter((name) => name.length > 0)
    .map((name) => name.replace(/-\d+$/, ''))
}

export function observeRjsf(
  schema: JsonObject,
  uiSchema: RjsfUiSchema,
  data: unknown,
): StepObservables {
  assertNoUnderscores(schema)

  // The verdict is taken from the validator directly rather than inferred from
  // whether submission happened, so that "the step says this is invalid" and
  // "the step refused to submit" stay separate observations. Conflating them
  // would hide a form that rejects data its own validator accepts.
  const verdict = validator.validateFormData(data, schema as RJSFSchema)
  const errors = verdict.errors.map((error) =>
    canonicalError({
      pointer: pointerFromRjsfProperty(error.property ?? ''),
      keyword: error.name ?? 'unknown',
    }),
  )

  let submitted = false
  let payload: unknown = null

  const { container } = render(
    createElement(Form, {
      schema: schema as RJSFSchema,
      uiSchema,
      validator,
      formData: data,
      // Off, so a step receives the accumulated form data of the steps before
      // it and passes the keys it does not know about through, which is how
      // Backstage carries one `formData` across the whole wizard.
      omitExtraData: false,
      liveValidate: false,
      onSubmit: ({ formData }) => {
        submitted = true
        payload = formData
      },
      onError: () => {},
    }),
  )

  const fields = sortUnique(
    fieldNames(container)
      .map(pointerFromRjsfName)
      .filter((pointer): pointer is string => pointer !== null && pointer !== ''),
  )

  const form = container.querySelector('form')
  if (!form) throw new Error('RJSF rendered no form element')
  fireEvent.submit(form)

  cleanup()

  return {
    fields,
    valid: verdict.errors.length === 0,
    errors: sortUnique(errors),
    submitted,
    payload,
  }
}
