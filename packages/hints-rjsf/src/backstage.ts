import type { JsonObject, JsonValue, OutsideJson } from './json.js'
import { deepEqual, define, isJsonArray, isJsonObject, member, toJson } from './json.js'
import { append } from './pointer.js'
import type { UiSchemaIssue } from './types.js'

export interface BackstageStepSplit {
  readonly schema: JsonObject
  readonly uiSchema: JsonObject
  readonly sources: ReadonlyMap<string, readonly string[]>
  readonly issues: readonly UiSchemaIssue[]
}

export function splitBackstageStep(step: unknown): BackstageStepSplit {
  const outside: OutsideJson[] = []
  const json = toJson(step, outside)
  const issues: UiSchemaIssue[] = outside.map((found) => ({
    code: 'invalid-value',
    key: found.key,
    path: found.path,
    message: `Outside the JSON-serializable profile: ${found.reason}.`,
  }))
  const sources = new Map<string, string[]>()
  if (!isJsonObject(json)) {
    if (json !== undefined) {
      issues.push({ code: 'invalid-value', key: '', path: '', value: json, message: 'A Backstage parameter step is an object.' })
    }
    return { schema: {}, uiSchema: {}, sources, issues }
  }
  const move = (ui: JsonObject, key: string, value: JsonValue, uiPath: string, from: string): void => {
    const at = append(uiPath, key)
    const previous = member(ui, key)
    if (previous !== undefined && !deepEqual(previous, value)) {
      issues.push({
        code: 'conditional',
        key,
        path: at,
        value,
        message: 'Two branches of the step write different values here; Backstage keeps the last one for every branch, and so does this split.',
      })
    }
    define(ui, key, value)
    sources.set(at, [...(sources.get(at) ?? []), from])
  }
  const extract = (node: JsonObject, ui: JsonObject, schemaPath: string, uiPath: string): void => {
    for (const key of Object.keys(node)) {
      if (!key.startsWith('ui:') && key !== 'enumNames') continue
      move(ui, key === 'enumNames' ? 'ui:enumNames' : key, node[key] as JsonValue, uiPath, append(schemaPath, key))
      delete (node as Record<string, JsonValue>)[key]
    }
    const properties = member(node, 'properties')
    if (isJsonObject(properties)) {
      for (const name of Object.keys(properties)) {
        const child = properties[name]
        if (!isJsonObject(child)) continue
        if (!isJsonObject(member(ui, name))) define(ui, name, {})
        extract(child, member(ui, name) as JsonObject, append(append(schemaPath, 'properties'), name), append(uiPath, name))
      }
    }
    const items = member(node, 'items')
    if (isJsonObject(items)) {
      const inner: JsonObject = {}
      define(ui, 'items', inner)
      extract(items, inner, append(schemaPath, 'items'), append(uiPath, 'items'))
    }
    for (const keyword of ['anyOf', 'oneOf', 'allOf']) {
      const branches = member(node, keyword)
      if (!isJsonArray(branches)) continue
      branches.forEach((branch, index) => {
        if (isJsonObject(branch)) extract(branch, ui, `${append(schemaPath, keyword)}/${index}`, uiPath)
      })
    }
    const dependencies = member(node, 'dependencies')
    if (isJsonObject(dependencies)) {
      for (const name of Object.keys(dependencies)) {
        const dependency = dependencies[name]
        if (isJsonObject(dependency)) extract(dependency, ui, append(append(schemaPath, 'dependencies'), name), uiPath)
      }
    }
    for (const keyword of ['then', 'else']) {
      const branch = member(node, keyword)
      if (isJsonObject(branch)) extract(branch, ui, append(schemaPath, keyword), uiPath)
    }
  }
  const uiSchema: JsonObject = {}
  extract(json, uiSchema, '', '')
  return { schema: json, uiSchema, sources, issues }
}
