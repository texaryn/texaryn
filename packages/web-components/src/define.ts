import { TexarynFormElement } from './element.js'

/** Registers the element once; a second call for the same tag is a no-op that returns the class. */
export function defineTexarynForm(tagName = 'texaryn-form'): typeof TexarynFormElement {
  if (!customElements.get(tagName)) customElements.define(tagName, TexarynFormElement)
  return TexarynFormElement
}
