import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { render, cleanup } from '@testing-library/react'
import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import type { RJSFSchema } from '@rjsf/utils'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { inferTypes } from './candidate/infer-types.js'
import { TexarynStepForm } from './candidate/TexarynStepForm.js'

/**
 * What an array of enum strings with `ui:widget: checkboxes` actually renders
 * on each side.
 *
 * Written because the first reading of the field-set divergence was wrong. The
 * DOM shows `input type=text` for each element, which looked like a free-text
 * fallback; it is the hidden native input that a MUI `Select` renders beside
 * its combobox. Each element is enum-constrained after all, so the divergence
 * is one control for the array versus one control per element, and not a loss
 * of the constraint. Pinned so the corrected claim cannot drift back.
 */
const featuresStep = {
  properties: {
    features: {
      title: 'Features',
      type: 'array',
      uniqueItems: true,
      items: { type: 'string', enum: ['logging', 'metrics', 'tracing', 'profiling'] },
      'ui:widget': 'checkboxes',
    },
  },
}

const selected = { features: ['logging', 'metrics'] }

describe('an array of enum strings', () => {
  it('RJSF renders one checkbox per option, for the array as a whole', () => {
    const { schema, uiSchema } = {
      schema: { properties: { features: { ...featuresStep.properties.features } } },
      uiSchema: { features: { 'ui:widget': 'checkboxes' } },
    }
    delete (schema.properties.features as Record<string, unknown>)['ui:widget']

    const { container } = render(
      createElement(Form, {
        schema: schema as RJSFSchema,
        uiSchema,
        validator,
        formData: selected,
      }),
    )

    const checkboxes = Array.from(container.querySelectorAll('input[type="checkbox"]'))
    // One per enum member, all sharing the array's name.
    expect(checkboxes).toHaveLength(4)
    expect(new Set(checkboxes.map((box) => (box as HTMLInputElement).name))).toEqual(
      new Set(['root_features']),
    )

    cleanup()
  })

  it('Texaryn renders one enum-constrained select per element', async () => {
    const port = await createJsonSchemaAdapter(inferTypes(featuresStep), {
      defaultDialect: 'draft-07',
    })
    const { container } = render(createElement(TexarynStepForm, { port, initialData: selected }))

    // The constraint is kept: each element is a combobox, not a text field.
    const comboboxes = Array.from(container.querySelectorAll('[role="combobox"]'))
    expect(comboboxes).toHaveLength(2)
    expect(comboboxes.map((combo) => (combo.textContent ?? '').trim())).toEqual([
      'logging',
      'metrics',
    ])

    // The `input type=text` beside each one is the Select's hidden native
    // input, which is what made this look like a free-text fallback.
    const inputs = Array.from(container.querySelectorAll('input'))
    expect(inputs.map((input) => input.name)).toEqual(['/features/0', '/features/1'])

    cleanup()
  })
})
