import type { VisibleError } from '../types.js'
import { englishMessages } from '../messages/english.js'
import type { FormMessages } from '../messages/types.js'

export function visibleErrorLabel(error: VisibleError): string {
  return error.fieldTitle ?? error.pointer ?? error.nodeId
}

export function visibleErrorMessages(error: VisibleError, messages: FormMessages = englishMessages): string[] {
  return error.errors.map((entry) => messages.validationMessage(entry))
}
