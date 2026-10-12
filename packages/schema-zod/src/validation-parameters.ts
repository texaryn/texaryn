export function validationParameters(keyword: string, source: Record<string, unknown>): Record<string, unknown> {
  if (keyword === 'format') {
    return typeof source.format === 'string' ? { format: source.format } : {}
  }

  if (
    keyword === 'minLength' || keyword === 'minItems' || keyword === 'minProperties' ||
    keyword === 'minimum' || keyword === 'exclusiveMinimum'
  ) {
    const limit = source.minimum
    return typeof limit === 'number' && Number.isFinite(limit) ? { limit } : {}
  }

  if (
    keyword === 'maxLength' || keyword === 'maxItems' || keyword === 'maxProperties' ||
    keyword === 'maximum' || keyword === 'exclusiveMaximum'
  ) {
    const limit = source.maximum
    return typeof limit === 'number' && Number.isFinite(limit) ? { limit } : {}
  }

  if (keyword === 'multipleOf') {
    const limit = source.divisor
    return typeof limit === 'number' && Number.isFinite(limit) ? { limit } : {}
  }

  return {}
}
