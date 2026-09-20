import type { VisibleError } from '../types.js'

export function visibleErrorLabel(error: VisibleError): string {
  return error.fieldTitle ?? error.pointer ?? error.nodeId
}

export function visibleErrorMessages(error: VisibleError): string[] {
  return error.errors.map((entry) => entry.message ?? entry.keyword)
}
