export type Dialect = 'draft-07' | '2019-09' | '2020-12'

export interface DialectConfig {
  defaultDialect: Dialect
}

export function detectDialect(schema: unknown, config: DialectConfig): Dialect {
  if (typeof schema !== 'object' || schema === null) return config.defaultDialect
  const s = schema as Record<string, unknown>
  if (typeof s.$schema === 'string') {
    if (s.$schema.includes('draft-07')) return 'draft-07'
    if (s.$schema.includes('2019-09')) return '2019-09'
    if (s.$schema.includes('2020-12')) return '2020-12'
  }
  return config.defaultDialect
}
