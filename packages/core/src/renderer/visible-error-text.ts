import type { VisibleError } from '../types.js'
import { englishMessages } from '../messages/english.js'
import type { FormMessages } from '../messages/types.js'

function fallbackFieldLabel(
  context: { fieldName?: string; itemPosition?: number },
  messages: FormMessages,
): string {
  return messages.fieldLabel?.(context) ?? englishMessages.fieldLabel!(context)
}

export function visibleFieldLabel(
  fieldTitle: string | undefined,
  pointer: string | null | undefined,
  messages: FormMessages = englishMessages,
): string {
  if (fieldTitle?.trim()) return fieldTitle

  const segment = pointer?.split('/').at(-1)
  if (!segment) return fallbackFieldLabel({}, messages)
  if (/^\d+$/.test(segment)) {
    return fallbackFieldLabel({ itemPosition: Number(segment) + 1 }, messages)
  }

  const name = segment
    .replace(/~1/g, '/')
    .replace(/~0/g, '~')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim()
  return name
    ? fallbackFieldLabel({ fieldName: `${name[0]!.toUpperCase()}${name.slice(1)}` }, messages)
    : fallbackFieldLabel({}, messages)
}

export function visibleErrorLabel(error: VisibleError, messages: FormMessages = englishMessages): string {
  return visibleFieldLabel(error.fieldTitle, error.pointer, messages)
}

export function visibleErrorMessages(error: VisibleError, messages: FormMessages = englishMessages): string[] {
  return error.errors.map((entry) => messages.validationMessage(entry))
}
