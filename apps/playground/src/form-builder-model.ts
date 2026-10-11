export type BuilderFieldType = 'string' | 'number' | 'integer' | 'boolean'

export interface BuilderField {
  readonly name: string
  readonly title: string
  readonly type: BuilderFieldType
  readonly required: boolean
}

export interface FormBuilderModel {
  readonly available: boolean
  readonly message?: string
  readonly fields: readonly BuilderField[]
  readonly advancedFields: readonly string[]
}

const fieldTypes = new Set<BuilderFieldType>(['string', 'number', 'integer', 'boolean'])
const rootKeywords = new Set([
  '$schema',
  'type',
  'title',
  'description',
  'properties',
  'required',
  'additionalProperties',
])
const fieldKeywords = new Set(['type', 'title', 'description'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isBuilderFieldType(value: unknown): value is BuilderFieldType {
  return typeof value === 'string' && fieldTypes.has(value as BuilderFieldType)
}

function parseSchema(text: string): unknown {
  return JSON.parse(text) as unknown
}

export function getFormBuilderModel(schemaText: string): FormBuilderModel {
  let schema: unknown
  try {
    schema = parseSchema(schemaText)
  } catch {
    return { available: false, message: 'Fix the JSON Schema before using the visual builder.', fields: [], advancedFields: [] }
  }
  if (!isRecord(schema) || schema.type !== 'object') {
    return { available: false, message: 'The visual builder requires an object-root JSON Schema.', fields: [], advancedFields: [] }
  }
  if (Object.keys(schema).some((key) => !rootKeywords.has(key))) {
    return { available: false, message: 'This schema uses root keywords that the visual builder does not edit. Use the JSON editor.' , fields: [], advancedFields: [] }
  }
  if (
    !isRecord(schema.properties) ||
    (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some((name) => typeof name !== 'string'))) ||
    (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== 'boolean')
  ) {
    return { available: false, message: 'This schema shape is not supported by the visual builder. Use the JSON editor.', fields: [], advancedFields: [] }
  }

  const required = new Set(schema.required as string[] | undefined)
  const fields: BuilderField[] = []
  const advancedFields: string[] = []
  for (const [name, field] of Object.entries(schema.properties)) {
    if (
      isRecord(field) &&
      isBuilderFieldType(field.type) &&
      Object.keys(field).every((key) => fieldKeywords.has(key))
    ) {
      fields.push({
        name,
        title: typeof field.title === 'string' ? field.title : name,
        type: field.type,
        required: required.has(name),
      })
    } else {
      advancedFields.push(name)
    }
  }
  return { available: true, fields, advancedFields }
}

function writableSchema(schema: unknown): { root: Record<string, unknown>; properties: Record<string, unknown> } {
  if (!isRecord(schema) || !isRecord(schema.properties)) throw new TypeError('The visual builder requires an object-root schema.')
  return { root: schema, properties: schema.properties }
}

function copyProperty(properties: Record<string, unknown>, name: string, value: unknown): Record<string, unknown> {
  const copy = { ...properties }
  Object.defineProperty(copy, name, { value, enumerable: true, configurable: true, writable: true })
  return copy
}

export function addBuilderField(schemaText: string): string {
  const { root, properties } = writableSchema(parseSchema(schemaText))
  if (getFormBuilderModel(schemaText).available !== true) throw new TypeError('The visual builder cannot edit this schema.')
  let suffix = 1
  let name = 'field'
  while (Object.hasOwn(properties, name)) {
    suffix += 1
    name = `field${suffix}`
  }
  const title = suffix === 1 ? 'Field' : `Field ${suffix}`
  const nextProperties = copyProperty(properties, name, { type: 'string', title })
  const next = { ...root, properties: nextProperties }
  return JSON.stringify(next, null, 2)
}

export function updateBuilderField(
  schemaText: string,
  name: string,
  update: Partial<Pick<BuilderField, 'title' | 'type' | 'required'>>,
): string {
  const schema = parseSchema(schemaText)
  const { root, properties } = writableSchema(schema)
  if (getFormBuilderModel(schemaText).available !== true) throw new TypeError('The visual builder cannot edit this schema.')
  const field = properties[name]
  if (!isRecord(field) || !isBuilderFieldType(field.type) || !Object.keys(field).every((key) => fieldKeywords.has(key))) {
    throw new TypeError(`Field "${name}" is managed in the JSON editor.`)
  }

  const nextField = { ...field }
  if (update.title !== undefined) nextField.title = update.title
  if (update.type !== undefined) nextField.type = update.type
  const nextProperties = copyProperty(properties, name, nextField)
  const next: Record<string, unknown> = { ...root, properties: nextProperties }

  if (update.required !== undefined) {
    const current = Array.isArray(root.required) ? root.required.filter((entry): entry is string => typeof entry === 'string') : []
    const nextRequired = update.required
      ? [...current.filter((entry) => entry !== name), name]
      : current.filter((entry) => entry !== name)
    if (nextRequired.length === 0) delete next.required
    else next.required = nextRequired
  }

  return JSON.stringify(next, null, 2)
}

export function removeBuilderField(schemaText: string, name: string): string {
  const schema = parseSchema(schemaText)
  const { root, properties } = writableSchema(schema)
  if (getFormBuilderModel(schemaText).available !== true) throw new TypeError('The visual builder cannot edit this schema.')
  if (!Object.hasOwn(properties, name)) return schemaText

  const nextProperties = { ...properties }
  delete nextProperties[name]
  const next: Record<string, unknown> = { ...root, properties: nextProperties }
  if (Array.isArray(root.required)) {
    const required = root.required.filter((entry) => entry !== name)
    if (required.length === 0) delete next.required
    else next.required = required
  }
  return JSON.stringify(next, null, 2)
}
