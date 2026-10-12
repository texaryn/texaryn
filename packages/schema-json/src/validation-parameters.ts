export function validationParameters(
  keyword: string,
  data: Record<string, unknown>,
  code: string,
): Record<string, unknown> {
  if (keyword === 'required') {
    return typeof data.key === 'string' ? { missingProperty: data.key } : {}
  }
  if (keyword === 'format') {
    if (typeof data.format === 'string') return { format: data.format }
    const fromCode = code.startsWith('format-')
      ? code.slice('format-'.length).replace(/-(error|warning)$/, '')
      : ''
    return fromCode ? { format: fromCode } : {}
  }

  const limitKey = {
    minLength: 'minLength',
    maxLength: 'maxLength',
    minimum: 'minimum',
    maximum: 'maximum',
    exclusiveMinimum: 'minimum',
    exclusiveMaximum: 'maximum',
    multipleOf: 'multipleOf',
    minItems: 'minItems',
    maxItems: 'maximum',
    minProperties: 'minProperties',
    maxProperties: 'maxProperties',
  }[keyword]
  const value = limitKey === undefined ? undefined : data[limitKey]
  return typeof value === 'number' && Number.isFinite(value) ? { limit: value } : {}
}
