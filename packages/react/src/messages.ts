import { createContext, useContext } from 'react'
import { englishMessages } from '@texaryn/core'
import type { FormMessages } from '@texaryn/core'

const MessagesContext = createContext<FormMessages>(englishMessages)

export const MessagesProvider = MessagesContext.Provider

/**
 * English when nothing is provided, where `useFormIdPrefix` throws: a missing
 * namespace has no safe answer because two forms would collide, and a missing
 * locale has one.
 */
export function useFormMessages(): FormMessages {
  return useContext(MessagesContext)
}
