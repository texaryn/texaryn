import type { ChildProjection, JsonPointer } from '@texaryn/core'
import type { JsonValue } from './json.js'
import { isJsonArray } from './json.js'

export const AFTER_WILDCARD = 2 ** 40

export interface OrderIssue {
  readonly code: 'unknown-location' | 'unsupported' | 'invalid-value'
  readonly path: string
  readonly value?: JsonValue
  readonly message: string
}

export interface OrderResult {
  readonly orders: ReadonlyMap<JsonPointer, number>
  readonly issues: readonly OrderIssue[]
}

export function convertOrder(value: JsonValue, children: readonly ChildProjection[], path: string): OrderResult {
  if (!isJsonArray(value)) {
    return { orders: new Map(), issues: [{ code: 'invalid-value', path, value, message: 'RJSF ignores a ui:order that is not an array.' }] }
  }
  const pointers = new Map(children.map((child) => [child.key, child.pointer]))
  const issues: OrderIssue[] = []
  const listed: string[] = []
  const seen = new Set<string>()
  let wildcards = 0
  value.forEach((entry, index) => {
    const at = `${path}/${index}`
    if (entry === '*') {
      wildcards++
      listed.push('*')
    } else if (typeof entry !== 'string') {
      issues.push({ code: 'invalid-value', path: at, value: entry, message: 'A ui:order entry is a property name or "*".' })
    } else if (!pointers.has(entry)) {
      issues.push({
        code: 'unknown-location',
        path: at,
        value: entry,
        message: `No child named ${entry} is projected here: either a typo, which RJSF ignores too, or a property the schema declares that this port does not project.`,
      })
    } else if (seen.has(entry)) {
      issues.push({ code: 'unsupported', path: at, value: entry, message: `RJSF renders ${entry} once per mention, and Texaryn renders it once.` })
    } else {
      seen.add(entry)
      listed.push(entry)
    }
  })
  const unlisted = children.filter((child) => !seen.has(child.key)).map((child) => child.key)
  if (wildcards > 1) {
    issues.push({ code: 'invalid-value', path, value, message: 'RJSF renders a configuration error instead of this object when ui:order holds more than one "*".' })
    return { orders: new Map(), issues }
  }
  if (wildcards === 0 && unlisted.length > 0) {
    issues.push({
      code: 'invalid-value',
      path,
      value,
      message: `RJSF renders a configuration error instead of this object while ${unlisted.join(', ')} is present and unlisted; add "*" to the list.`,
    })
    return { orders: new Map(), issues }
  }
  const star = listed.indexOf('*')
  const before = star === -1 ? listed : listed.slice(0, star)
  const after = star === -1 ? [] : listed.slice(star + 1)
  const orders = new Map<JsonPointer, number>()
  before.forEach((name, index) => orders.set(pointers.get(name) as JsonPointer, index - before.length))
  after.forEach((name, index) => orders.set(pointers.get(name) as JsonPointer, AFTER_WILDCARD + index))
  return { orders, issues }
}
