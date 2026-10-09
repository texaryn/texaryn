import { isSchemaNode, type SchemaNode } from 'json-schema-library'
import type { Dialect } from './dialect.js'

const SCHEMA_SINGLE = new Set([
  'additionalItems',
  'additionalProperties',
  'contentSchema',
  'contains',
  'else',
  'if',
  'items',
  'not',
  'propertyNames',
  'then',
  'unevaluatedItems',
  'unevaluatedProperties',
])
const SCHEMA_LIST = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems'])
const SCHEMA_MAP = new Set([
  '$defs',
  'definitions',
  'dependencies',
  'dependentSchemas',
  'patternProperties',
  'properties',
])
const NON_SCHEMA_VALUES = new Set(['const', 'default', 'enum', 'examples'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSchemaRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) || Array.isArray(value) || typeof value === 'boolean'
}

export function supportsSubmissionProjection(schemas: readonly unknown[], dialect: Dialect): boolean {
  const seen = new WeakSet<object>()
  const visit = (value: unknown): boolean => {
    if (Array.isArray(value)) {
      if (seen.has(value)) return false
      seen.add(value)
      return value.some(visit)
    }
    if (!isRecord(value)) return false
    if (seen.has(value)) return false
    seen.add(value)
    if (typeof value.$dynamicRef === 'string' || typeof value.$recursiveRef === 'string') return true
    if (dialect !== 'draft-07' && ('unevaluatedItems' in value || 'unevaluatedProperties' in value)) return true

    for (const [keyword, child] of Object.entries(value)) {
      if (NON_SCHEMA_VALUES.has(keyword)) continue
      if (SCHEMA_SINGLE.has(keyword) && isSchemaRecord(child) && visit(child)) return true
      if (SCHEMA_LIST.has(keyword) && Array.isArray(child) && visit(child)) return true
      if (SCHEMA_MAP.has(keyword) && isRecord(child) && visit(Object.values(child))) return true
    }
    return false
  }

  return !schemas.some(visit)
}

function resolveReference(node: SchemaNode): SchemaNode | undefined {
  try {
    const target: unknown = node.resolveRef()
    return isSchemaNode(target) ? target : undefined
  } catch {
    return undefined
  }
}

function sameInstanceSchemas(roots: readonly SchemaNode[], dialect: Dialect): SchemaNode[] {
  const found: SchemaNode[] = []
  const seen = new Set<string>()
  const referencePath = new Set<string>()

  const visit = (node: unknown): void => {
    if (!isSchemaNode(node)) return
    const identity = `${node.schemaLocation}\n${node.evaluationPath}`
    if (seen.has(identity)) return
    seen.add(identity)
    if (referencePath.has(node.schemaLocation)) return
    referencePath.add(node.schemaLocation)

    if (typeof node.$ref === 'string') {
      const target = resolveReference(node)
      if (target && !referencePath.has(target.schemaLocation)) visit(target)
      if (dialect === 'draft-07') {
        referencePath.delete(node.schemaLocation)
        return
      }
    }
    found.push(node)

    for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
      for (const branch of node[keyword] ?? []) visit(branch)
    }
    visit(node.then)
    visit(node.else)
    for (const branch of Object.values(node.dependentSchemas ?? {})) visit(branch)
    for (const dependencies of Object.values(node.propertyDependencies ?? {})) {
      for (const branch of Object.values(dependencies)) visit(branch)
    }
    referencePath.delete(node.schemaLocation)
  }

  roots.forEach(visit)
  return found
}

interface PropertySchemas {
  explicit: SchemaNode[]
  additional: SchemaNode[]
}

function schemasForProperty(
  scopes: readonly SchemaNode[],
  key: string,
  dialect: Dialect,
): PropertySchemas {
  const explicit = new Set<SchemaNode>()
  const additional = new Set<SchemaNode>()
  for (const scope of sameInstanceSchemas(scopes, dialect)) {
    const properties = scope.properties
    const hasProperty = properties !== undefined && Object.hasOwn(properties, key)
    if (hasProperty) explicit.add(properties[key]!)

    let matchesPattern = false
    for (const pattern of scope.patternProperties ?? []) {
      if (!new RegExp(pattern.pattern.source, pattern.pattern.flags).test(key)) continue
      matchesPattern = true
      explicit.add(pattern.node)
    }

    if (!hasProperty && !matchesPattern && scope.additionalProperties) additional.add(scope.additionalProperties)
  }
  return { explicit: [...explicit], additional: [...additional] }
}

function additionalPropertiesForKey(
  scopes: readonly SchemaNode[],
  key: string,
  dialect: Dialect,
): SchemaNode[] {
  const found = new Set<SchemaNode>()
  for (const scope of sameInstanceSchemas(scopes, dialect)) {
    if (scope.properties !== undefined && Object.hasOwn(scope.properties, key)) continue
    if (scope.patternProperties?.some(({ pattern }) => new RegExp(pattern.source, pattern.flags).test(key))) continue
    if (scope.additionalProperties) found.add(scope.additionalProperties)
  }
  return [...found]
}

function selectedByAdditionalProperties(
  projection: SchemaNode,
  selected: SchemaNode,
  key: string,
  dialect: Dialect,
): boolean {
  const ancestors = new Set<string>()
  for (let node: SchemaNode | undefined = selected; node; node = node.parent) {
    ancestors.add(JSON.stringify([node.schemaLocation, node.evaluationPath]))
  }
  const candidates = additionalPropertiesForKey([projection], key, dialect)
  return candidates.some((node) => ancestors.has(JSON.stringify([node.schemaLocation, node.evaluationPath])))
}

function schemasForItem(scopes: readonly SchemaNode[], index: number, dialect: Dialect): SchemaNode[] {
  const result = new Set<SchemaNode>()
  for (const scope of sameInstanceSchemas(scopes, dialect)) {
    const prefix = scope.prefixItems?.[index]
    if (prefix) {
      result.add(prefix)
      continue
    }
    if (scope.items && (dialect === '2020-12' || index >= (scope.prefixItems?.length ?? 0))) {
      result.add(scope.items)
    }
  }
  return [...result]
}

function cloneObject(source: Record<string, unknown>, entries: readonly (readonly [string, unknown])[]): Record<string, unknown> {
  const copy = Object.create(Object.getPrototypeOf(source) === null ? null : Object.prototype) as Record<string, unknown>
  for (const [key, value] of entries) {
    Object.defineProperty(copy, key, { value, enumerable: true, configurable: true, writable: true })
  }
  return copy
}

function cloneData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneData)
  if (!isRecord(value)) return value
  return cloneObject(value, Object.entries(value).map(([key, child]) => [key, cloneData(child)]))
}

export function projectSubmissionData(
  validationRoot: SchemaNode,
  projectionRoot: SchemaNode,
  data: unknown,
  dialect: Dialect,
): unknown {
  const walk = (validationScopes: readonly SchemaNode[], projection: SchemaNode, value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map((item, index) => {
        let selection: ReturnType<SchemaNode['getNodeChild']>
        try {
          selection = projection.getNodeChild(index, value)
        } catch {
          return cloneData(item)
        }
        if (selection.error || !isSchemaNode(selection.node)) return cloneData(item)
        const itemScopes = schemasForItem(validationScopes, index, dialect)
        return walk(itemScopes.length > 0 ? itemScopes : [selection.node], selection.node, item)
      })
    }
    if (!isRecord(value)) return value

    const entries: [string, unknown][] = []
    for (const [key, childValue] of Object.entries(value)) {
      const childSchemas = schemasForProperty(validationScopes, key, dialect)
      let selection: ReturnType<SchemaNode['getNodeChild']>
      try {
        selection = projection.getNodeChild(key, value)
      } catch {
        entries.push([key, cloneData(childValue)])
        continue
      }

      if (selection.error) {
        entries.push([key, cloneData(childValue)])
      } else if (isSchemaNode(selection.node)) {
        if (childSchemas.explicit.length > 0 && selectedByAdditionalProperties(projection, selection.node, key, dialect)) continue
        entries.push([
          key,
          walk(
            [...childSchemas.explicit, ...childSchemas.additional].length > 0
              ? [...childSchemas.explicit, ...childSchemas.additional]
              : [selection.node],
            selection.node,
            childValue,
          ),
        ])
      } else if (childSchemas.explicit.length === 0) {
        entries.push([key, cloneData(childValue)])
      }
    }
    return cloneObject(value, entries)
  }

  return walk([validationRoot], projectionRoot, data)
}
