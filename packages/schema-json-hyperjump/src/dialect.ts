export type Dialect = 'draft-04' | 'draft-07' | '2019-09' | '2020-12'

export function isPre2019Dialect(dialect: string): boolean {
  return dialect === 'draft-04' || dialect === 'draft-07'
}

export function identifierKeyword(dialect: Dialect): 'id' | '$id' {
  return dialect === 'draft-04' ? 'id' : '$id'
}

export function schemaIdentifier(schema: Record<string, unknown>, dialect: Dialect): unknown {
  return schema[identifierKeyword(dialect)]
}

export interface DialectConfig {
  defaultDialect: Dialect
}

export function detectDialect(schema: unknown, config: DialectConfig): Dialect {
  if (typeof schema !== 'object' || schema === null) return config.defaultDialect
  const s = schema as Record<string, unknown>
  if (typeof s.$schema === 'string') {
    if (s.$schema.includes('draft-04')) return 'draft-04'
    if (s.$schema.includes('draft-07')) return 'draft-07'
    if (s.$schema.includes('2019-09')) return '2019-09'
    if (s.$schema.includes('2020-12')) return '2020-12'
  }
  return config.defaultDialect
}
