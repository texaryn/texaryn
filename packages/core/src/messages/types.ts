/**
 * The two surfaces of one control. `accessibleName` must contain `label`,
 * because a speech-input user says the word they can see and expects the
 * control to respond. The renderer decides which element carries which.
 */
export interface ActionMessage {
  /** The word on the control. Short, because it repeats down a list. */
  label: string
  /** The control's accessible name. Contains `label`. */
  accessibleName: string
}

export interface ItemActionContext {
  /** 1-based, as a person counts rows, and meant for display. */
  position: number
  /** The row's own title, which repeats across rows. */
  itemTitle?: string
  containerTitle?: string
}

export interface AddItemContext {
  /** The item template's title, never an existing row's: a row may not exist yet. */
  itemTemplateTitle?: string
  containerTitle?: string
}

/**
 * Text plus where it sits relative to the label. The renderer keeps the
 * marker out of the accessible name; the message never decides that.
 */
export interface IndicatorMessage {
  text: string
  placement: 'before' | 'after'
}

/**
 * Every piece of copy the built-in widgets invent. A locale implements the
 * whole interface, so a message added here fails a translated application at
 * compile time rather than leaking one English control into it.
 *
 * Functions rather than templates, because a sentence with slots encodes
 * English word order. The English already drops its container clause entirely
 * when the array has no title; another language decides that for itself.
 */
export interface FormMessages {
  addItem(context: AddItemContext): ActionMessage
  removeItem(context: ItemActionContext): ActionMessage
  moveItemUp(context: ItemActionContext): ActionMessage
  requiredIndicator(): IndicatorMessage
}
