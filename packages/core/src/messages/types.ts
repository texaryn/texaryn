export interface ActionMessage {
  label: string
  /** Contains `label`: a speech-input user says the word they can see. */
  accessibleName: string
}

export interface ItemActionContext {
  position: number
  itemTitle?: string
  containerTitle?: string
}

export interface AddItemContext {
  itemTemplateTitle?: string
  containerTitle?: string
}

export interface IndicatorMessage {
  text: string
  placement: 'before' | 'after'
}

/** Functions, not templates: a sentence with slots encodes one language's word order. */
export interface FormMessages {
  addItem(context: AddItemContext): ActionMessage
  removeItem(context: ItemActionContext): ActionMessage
  moveItemUp(context: ItemActionContext): ActionMessage
  requiredIndicator(): IndicatorMessage
}
