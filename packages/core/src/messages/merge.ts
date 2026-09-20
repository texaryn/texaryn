import type { FormMessages } from './types.js'

/**
 * Rewording, not translation. A locale implements `FormMessages` whole so a
 * new message cannot fall back to English unnoticed; this is for the caller
 * who wants one control worded differently and everything else as the base
 * says.
 */
export function mergeMessages(base: FormMessages, overrides: Partial<FormMessages>): FormMessages {
  const merged: FormMessages = { ...base }
  for (const key of Object.keys(overrides) as Array<keyof FormMessages>) {
    const value = overrides[key]
    if (value !== undefined) (merged as Record<keyof FormMessages, unknown>)[key] = value
  }
  return merged
}
