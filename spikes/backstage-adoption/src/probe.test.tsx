import { describe, it } from 'vitest'
import { render } from '@testing-library/react'
import { createElement } from 'react'
import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import { resolveTemplateParameters } from './backstage/resolve-template.js'
import { extractSchemaFromStep } from './backstage/extract-schema.js'
import { templateYaml, fragmentPath } from './template.js'
import { readFileSync } from 'node:fs'
import type { RJSFSchema } from '@rjsf/utils'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { TexarynStepForm } from './candidate/TexarynStepForm.js'

/**
 * Not an assertion, a measurement. The two sides name their DOM differently
 * and the field-set comparison depends on mapping both to JSON pointers, so
 * the mapping is written from what they emit rather than from what their
 * documentation implies.
 */
const read = async () => readFileSync(fragmentPath, 'utf8')

describe('what each side puts in the DOM', () => {
  it('dumps Texaryn field identifiers per step', async () => {
    const steps = await resolveTemplateParameters(templateYaml, read)
    for (const [index, step] of steps.entries()) {
      const { schema } = extractSchemaFromStep(step)
      console.log(`\n--- Texaryn step ${index}: ${String(step.title)} ---`)
      let container: HTMLElement
      try {
        const port = await createJsonSchemaAdapter(schema, { defaultDialect: 'draft-07' })
        container = render(createElement(TexarynStepForm, { port })).container
      } catch (error) {
        console.log(`  THREW: ${(error as Error).name}: ${(error as Error).message}`)
        continue
      }
      const found = [...container.querySelectorAll('input, select, textarea')].map((element) => {
        const el = element as HTMLInputElement
        return `${el.tagName.toLowerCase()} id=${el.id} name=${el.name} type=${el.type}`
      })
      if (found.length === 0) console.log('  (no inputs)')
      for (const line of found) console.log(`  ${line}`)
    }
  })

  it('dumps RJSF field identifiers per step', async () => {
    const steps = await resolveTemplateParameters(templateYaml, read)
    for (const [index, step] of steps.entries()) {
      const { schema, uiSchema } = extractSchemaFromStep(step)
      const { container } = render(
        createElement(Form, { schema: schema as RJSFSchema, uiSchema, validator }),
      )
      const found = [...container.querySelectorAll('input, select, textarea')].map((element) => {
        const el = element as HTMLInputElement
        return `${el.tagName.toLowerCase()} id=${el.id} name=${el.name} type=${el.type}`
      })
      console.log(`\n--- RJSF step ${index}: ${String(step.title)} ---`)
      for (const line of found) console.log(`  ${line}`)
    }
  })
})
