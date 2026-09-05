import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import type { SchemaEvaluationPort } from '@texaryn/core'

export function adapterFor(schema: unknown): Promise<SchemaEvaluationPort> {
  return createJsonSchemaAdapter(schema)
}

/** Lets the async validator resolve and the disconnect microtask run. */
export function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export function type(control: HTMLInputElement, value: string): void {
  control.value = value
  control.dispatchEvent(new Event('input', { bubbles: true }))
}

export const conditionalSchema = {
  type: 'object',
  properties: {
    kind: { type: 'string', title: 'Kind' },
  },
  if: { properties: { kind: { const: 'b' } }, required: ['kind'] },
  then: { properties: { extra: { type: 'string', title: 'Extra' } } },
}

export const listSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      title: 'Items',
      items: {
        type: 'object',
        properties: { name: { type: 'string', title: 'Name' } },
      },
    },
  },
}

export const requiredSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Full name', description: 'As on your passport', minLength: 1 },
  },
  required: ['name'],
}
