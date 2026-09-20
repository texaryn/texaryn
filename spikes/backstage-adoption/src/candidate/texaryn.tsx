import { createElement } from 'react'
import { render, cleanup, act } from '@testing-library/react'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import type { FormRuntime, FormRuntimeOptions, UIHints } from '@texaryn/core'
import type { JsonObject } from '../backstage/extract-schema.js'
import { canonicalError, sortUnique, type StepObservables } from '../observables.js'
import { TexarynStepForm } from './TexarynStepForm.js'

/**
 * Texaryn puts the field's JSON pointer straight on the input's `name`, so no
 * mapping is needed on this side. Worth recording as the one place the
 * integration was easier than the reference implementation.
 */
function fieldPointers(container: HTMLElement): string[] {
  return sortUnique(
    Array.from(container.querySelectorAll('input, select, textarea'))
      .map((element) => (element as HTMLInputElement).name)
      .filter((name) => name.startsWith('/')),
  )
}

export async function observeTexaryn(
  schema: JsonObject,
  hints: UIHints,
  data: unknown,
  options: Pick<FormRuntimeOptions, 'initialization'> = {},
): Promise<StepObservables> {
  const port = await createJsonSchemaAdapter(schema, {
    defaultDialect: 'draft-07',
  })

  const verdict = await port.validate(data)
  const errors = verdict.errors.map((error) =>
    canonicalError({ pointer: error.instancePointer, keyword: error.keyword }),
  )

  let submitted = false
  let payload: unknown = null
  let runtime: FormRuntime | undefined

  const { container } = render(
    createElement(TexarynStepForm, {
      port,
      initialData: data,
      hints,
      initialization: options.initialization,
      onSubmit: (submittedData) => {
        submitted = true
        payload = submittedData
      },
      onRuntime: (value) => {
        runtime = value
      },
    }),
  )

  const fields = fieldPointers(container)

  if (!runtime) throw new Error('no runtime was handed back')
  // Submission is asynchronous: the runtime validates first and only then runs
  // the handler, so the assertion has to wait for that to settle.
  await act(async () => {
    runtime!.dispatch({ type: 'Submit' })
    await Promise.resolve()
  })

  cleanup()

  return {
    fields,
    valid: verdict.valid,
    errors: sortUnique(errors),
    submitted,
    payload,
  }
}
