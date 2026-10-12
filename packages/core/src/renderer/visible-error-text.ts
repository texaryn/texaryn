import type { VisibleError } from '../types.js'
import { englishMessages } from '../messages/english.js'
import type { FormMessages } from '../messages/types.js'

export function visibleErrorLabel(error: VisibleError): string {
  if (error.fieldTitle?.trim()) return error.fieldTitle

  const segment = error.pointer?.split('/').at(-1)
  if (!segment) return 'Field'
  if (/^\d+$/.test(segment)) return `Item ${Number(segment) + 1}`

  const name = segment
    .replace(/~1/g, '/')
    .replace(/~0/g, '~')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim()
  return name ? `${name[0]!.toUpperCase()}${name.slice(1)}` : 'Field'
}

export function visibleErrorMessages(error: VisibleError, messages: FormMessages = englishMessages): string[] {
  return error.errors.map((entry) => messages.validationMessage(entry))
}
