import type { UIHints, FieldHints } from '@texaryn/core'
import type { JsonObject, UiSchema } from '../backstage/extract-schema.js'

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Converts RJSF's uiSchema into Texaryn's `UIHints`.
 *
 * The two representations disagree on both shape and vocabulary, so this is an
 * adapter rather than a rename. RJSF's uiSchema is a tree that mirrors the
 * schema and carries `ui:`-prefixed keys; `UIHints` is a flat map keyed by
 * JSON pointer. Recorded in the friction log as preprocessing.
 *
 * Only four hints have anywhere to go. `@texaryn/react-mui`'s registry
 * dispatches on the node's type and enum, and consults `widget` for exactly
 * one value, `textarea`; every other `ui:widget` in a Backstage template
 * (`password`, `color`, `hidden`, `range`, `radio`, `checkboxes`, `date`,
 * `date-time`, `time`, `file`, `updown`) has no widget to select and falls
 * back to the type's default. `ui:field`, which is how Backstage names its
 * custom field extensions, has no equivalent at all: a field extension is a
 * component registration, which is `RendererRegistry.register` rather than a
 * hint. What this drops is listed in `unmapped`, so the loss is measurable
 * rather than assumed.
 */
export interface MappedHints {
  hints: UIHints
  /** `pointer ui:key` for every hint that had nowhere to go. */
  unmapped: string[]
}

const mapped = new Set([
  'ui:widget',
  'ui:placeholder',
  'ui:description',
  'ui:help',
  'ui:order',
  // Carried by the schema itself rather than by a hint, so not a loss.
  'ui:autofocus',
  'ui:options',
  'ui:emptyValue',
  'ui:autocomplete',
])

export function toUiHints(uiSchema: UiSchema): MappedHints {
  const hints: UIHints = {}
  const unmapped: string[] = []

  const walk = (node: UiSchema, pointer: string): void => {
    const fieldHints: FieldHints = {}

    for (const [key, value] of Object.entries(node)) {
      if (!key.startsWith('ui:')) continue

      if (key === 'ui:widget' && typeof value === 'string') {
        fieldHints.widget = value
        // Only `textarea` resolves to a widget. The rest are recorded as lost
        // even though they are technically carried across, because carrying a
        // name nothing dispatches on is not the same as honouring it.
        if (value !== 'textarea') unmapped.push(`${pointer || '/'} ui:widget=${value}`)
        continue
      }
      if (key === 'ui:placeholder' && typeof value === 'string') {
        fieldHints.placeholder = value
        continue
      }
      if ((key === 'ui:description' || key === 'ui:help') && typeof value === 'string') {
        fieldHints.helpText = value
        continue
      }
      if (key === 'ui:order' && Array.isArray(value)) {
        // Sibling order, so it is recorded against the children rather than
        // against the object that declares it.
        value.forEach((name, index) => {
          if (typeof name !== 'string' || name === '*') return
          const childPointer = `${pointer}/${name}`
          hints[childPointer] = {
            ...(hints[childPointer] as FieldHints),
            order: index,
          }
        })
        continue
      }
      if (!mapped.has(key)) unmapped.push(`${pointer || '/'} ${key}`)
    }

    if (Object.keys(fieldHints).length > 0) {
      hints[pointer] = { ...(hints[pointer] as FieldHints), ...fieldHints }
    }

    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('ui:') || !isObject(value)) continue
      // `items` is where the two representations stop lining up: RJSF states a
      // hint once for every element of an array, and a Texaryn pointer names
      // one element. The kitchen sink puts no `ui:*` inside `items`, so this
      // exercise never had to choose, and the gap is recorded rather than
      // resolved by guessing.
      walk(value, key === 'items' ? `${pointer}/items` : `${pointer}/${key}`)
    }
  }

  walk(uiSchema, '')
  return { hints, unmapped: [...new Set(unmapped)].sort() }
}
