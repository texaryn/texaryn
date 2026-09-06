import { texarynFormElementClass } from './element.js'

/** Registers the element once; a second call for the same tag returns what is already registered. */
export function defineTexarynForm(tagName = 'texaryn-form'): CustomElementConstructor {
  const existing = customElements.get(tagName)
  if (existing) return existing
  const constructor = texarynFormElementClass()
  customElements.define(tagName, constructor)
  return constructor
}
