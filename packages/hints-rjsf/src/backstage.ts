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

interface BackstageExtraction {
  readonly sources: Map<string, string[]>
  readonly issues: UiSchemaIssue[]
}

function moveBackstageValue(
  ui: JsonObject,
  key: string,
  value: JsonValue,
  uiPath: string,
  from: string,
  extraction: BackstageExtraction,
): void {
  const at = append(uiPath, key)
  const previous = member(ui, key)
  if (previous !== undefined && !deepEqual(previous, value)) {
    extraction.issues.push({
      code: 'conditional',
      key,
      path: at,
      value,
      message: 'Two branches of the step write different values here; Backstage keeps the last one for every branch, and so does this split.',
    })
  }
  define(ui, key, value)
  extraction.sources.set(at, [...(extraction.sources.get(at) ?? []), from])
}

function extractBackstageKeywords(
  node: JsonObject,
  ui: JsonObject,
  schemaPath: string,
  uiPath: string,
  extraction: BackstageExtraction,
): void {
  for (const key of Object.keys(node)) {
    if (!key.startsWith('ui:') && key !== 'enumNames') continue
    moveBackstageValue(
      ui,
      key === 'enumNames' ? 'ui:enumNames' : key,
      node[key] as JsonValue,
      uiPath,
      append(schemaPath, key),
      extraction,
    )
    delete (node as Record<string, JsonValue>)[key]
  }
}

function extractBackstageProperties(
  node: JsonObject,
  ui: JsonObject,
  schemaPath: string,
  uiPath: string,
  extraction: BackstageExtraction,
): void {
  const properties = member(node, 'properties')
  if (!isJsonObject(properties)) return
  for (const name of Object.keys(properties)) {
    const child = properties[name]
    if (!isJsonObject(child)) continue
    if (!isJsonObject(member(ui, name))) define(ui, name, {})
    extractBackstageNode(
      child,
      member(ui, name) as JsonObject,
      append(append(schemaPath, 'properties'), name),
      append(uiPath, name),
      extraction,
    )
  }
}

function extractBackstageItems(
  node: JsonObject,
  ui: JsonObject,
  schemaPath: string,
  uiPath: string,
  extraction: BackstageExtraction,
): void {
  const items = member(node, 'items')
  if (!isJsonObject(items)) return
  const inner: JsonObject = {}
  define(ui, 'items', inner)
  extractBackstageNode(items, inner, append(schemaPath, 'items'), append(uiPath, 'items'), extraction)
}

function extractBackstageApplicators(
  node: JsonObject,
  ui: JsonObject,
  schemaPath: string,
  uiPath: string,
  extraction: BackstageExtraction,
): void {
  for (const keyword of ['anyOf', 'oneOf', 'allOf']) {
    const branches = member(node, keyword)
    if (!isJsonArray(branches)) continue
    branches.forEach((branch, index) => {
      if (isJsonObject(branch)) {
        extractBackstageNode(branch, ui, `${append(schemaPath, keyword)}/${index}`, uiPath, extraction)
      }
    })
  }
}

function extractBackstageDependencies(
  node: JsonObject,
  ui: JsonObject,
  schemaPath: string,
  uiPath: string,
  extraction: BackstageExtraction,
): void {
  const dependencies = member(node, 'dependencies')
  if (!isJsonObject(dependencies)) return
  for (const name of Object.keys(dependencies)) {
    const dependency = dependencies[name]
    if (!isJsonObject(dependency)) continue
    extractBackstageNode(
      dependency,
      ui,
      append(append(schemaPath, 'dependencies'), name),
      uiPath,
      extraction,
    )
  }
}

function extractBackstageConditionalBranches(
  node: JsonObject,
  ui: JsonObject,
  schemaPath: string,
  uiPath: string,
  extraction: BackstageExtraction,
): void {
  for (const keyword of ['then', 'else']) {
    const branch = member(node, keyword)
    if (isJsonObject(branch)) {
      extractBackstageNode(branch, ui, append(schemaPath, keyword), uiPath, extraction)
    }
  }
}

function extractBackstageNode(
  node: JsonObject,
  ui: JsonObject,
  schemaPath: string,
  uiPath: string,
  extraction: BackstageExtraction,
): void {
  extractBackstageKeywords(node, ui, schemaPath, uiPath, extraction)
  extractBackstageProperties(node, ui, schemaPath, uiPath, extraction)
  extractBackstageItems(node, ui, schemaPath, uiPath, extraction)
  extractBackstageApplicators(node, ui, schemaPath, uiPath, extraction)
  extractBackstageDependencies(node, ui, schemaPath, uiPath, extraction)
  extractBackstageConditionalBranches(node, ui, schemaPath, uiPath, extraction)
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
  const uiSchema: JsonObject = {}
  extractBackstageNode(json, uiSchema, '', '', { sources, issues })
  return { schema: json, uiSchema, sources, issues }
}
