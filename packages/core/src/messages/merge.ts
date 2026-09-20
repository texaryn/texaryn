import type { FormMessages } from './types.js'

/** Rewording only: a locale implements `FormMessages` whole, so nothing falls back to English unnoticed. */
export function mergeMessages(base: FormMessages, overrides: Partial<FormMessages>): FormMessages {
  const merged: FormMessages = { ...base }
  for (const key of Object.keys(overrides) as Array<keyof FormMessages>) {
    const value = overrides[key]
    if (value !== undefined) (merged as Record<keyof FormMessages, unknown>)[key] = value
  }
  return merged
}
