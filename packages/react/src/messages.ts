import { createContext, useContext } from 'react'
import { englishMessages } from '@texaryn/core'
import type { FormMessages } from '@texaryn/core'

const MessagesContext = createContext<FormMessages>(englishMessages)

export const MessagesProvider = MessagesContext.Provider

/** English when nothing is provided: unlike a missing id prefix, a missing locale has a safe answer. */
export function useFormMessages(): FormMessages {
  return useContext(MessagesContext)
}
