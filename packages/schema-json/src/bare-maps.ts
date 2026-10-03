import { draft04, draft06, draft07, draft2019, draft2020, extendDraft, type Draft, type SchemaNode } from 'json-schema-library'

const MAPS_BY_KEYWORD: Record<string, string[]> = {
  properties: ['properties'],
  dependentSchemas: ['dependentSchemas'],
  dependentRequired: ['dependentRequired'],
  dependencies: ['dependentSchemas', 'dependentRequired'],
  propertyDependencies: ['propertyDependencies'],
}

// A plain map answers a lookup of "__proto__" with Object.prototype, which json-schema-library then runs as a schema.
function bare(node: SchemaNode, field: string): void {
  const record = node as unknown as Record<string, unknown>
  const map = record[field]
  if (typeof map !== 'object' || map === null || Array.isArray(map)) return
  const declared: unknown = Object.getPrototypeOf(map)
  if (declared === null) return
  const copy = Object.assign(Object.create(null), map) as Record<string, unknown>
  if (declared !== Object.prototype) copy['__proto__'] = declared
  record[field] = copy
}

function withBareMaps(draft: Draft): Draft {
  const keywords = draft.keywords.flatMap((keyword) => {
    const fields = MAPS_BY_KEYWORD[keyword.keyword]
    const parse = keyword.parse
    if (!fields || !parse) return []
    return [
      {
        ...keyword,
        parse: (node: SchemaNode) => {
          const result = parse(node)
          for (const field of fields) bare(node, field)
          return result
        },
      },
    ]
  })
  return extendDraft(draft, { keywords })
}

export const DRAFTS: Draft[] = [draft04, draft06, draft07, draft2019, draft2020].map(withBareMaps)
