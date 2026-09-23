import type { NodeProjection } from '@texaryn/core'
import type { JsonValue } from './json.js'
import type { Options } from './options.js'
import type { NodeKind } from './widgets.js'
import { widgetOutcome } from './widgets.js'

export interface KeyContext {
  readonly kind: NodeKind
  readonly node: NodeProjection
  readonly options: Options
  readonly readOnly: boolean
  readonly root: boolean
}

export type Disposition =
  | { readonly kind: 'hint'; readonly hint: 'placeholder' | 'helpText' }
  | { readonly kind: 'issue'; readonly code: 'unsupported' | 'conflict' | 'invalid-value'; readonly message: string }
  | { readonly kind: 'none' }

export const TEMPLATES: ReadonlySet<string> = new Set([
  'ArrayFieldDescriptionTemplate',
  'ArrayFieldItemTemplate',
  'ArrayFieldTemplate',
  'ArrayFieldTitleTemplate',
  'BaseInputTemplate',
  'DescriptionFieldTemplate',
  'ErrorListTemplate',
  'FieldErrorTemplate',
  'FieldHelpTemplate',
  'FieldTemplate',
  'ObjectFieldTemplate',
  'TitleFieldTemplate',
  'UnsupportedFieldTemplate',
  'WrapIfAdditionalTemplate',
])

const NONE: Disposition = { kind: 'none' }
const FIELDS: ReadonlySet<NodeKind> = new Set(['string', 'enum', 'number', 'boolean'])

function unsupported(message: string): Disposition {
  return { kind: 'issue', code: 'unsupported', message }
}

function notText(name: string): Disposition {
  return { kind: 'issue', code: 'invalid-value', message: `ui:${name} takes a string.` }
}

function textCell(name: 'placeholder' | 'description' | 'help', ctx: KeyContext): Disposition {
  const field = FIELDS.has(ctx.kind)
  switch (name) {
    case 'placeholder':
      if (ctx.kind === 'string' || ctx.kind === 'number') return { kind: 'hint', hint: 'placeholder' }
      return ctx.kind === 'enum'
        ? unsupported('RJSF labels the empty option of the select with it, and Texaryn renders no placeholder on a select.')
        : NONE
    case 'description':
      return field
        ? { kind: 'hint', hint: 'helpText' }
        : unsupported('RJSF shows this description on the group, and Texaryn renders none on an object or array.')
    case 'help':
      if (!field) return unsupported('RJSF shows help text under the group, and Texaryn renders none on an object or array.')
      if (ctx.node.annotations?.description !== undefined || typeof ctx.options.get('description')?.value === 'string') {
        return {
          kind: 'issue',
          code: 'conflict',
          message: 'The field already has a description; Texaryn shows one text where RJSF shows the description and the help text.',
        }
      }
      return { kind: 'hint', hint: 'helpText' }
  }
}

export function dispose(name: string, value: JsonValue, ctx: KeyContext): Disposition {
  const described = ctx.node.annotations?.description !== undefined
  switch (name) {
    case 'placeholder':
    case 'description':
    case 'help': {
      const cell = textCell(name, ctx)
      return cell === NONE || typeof value === 'string' ? cell : notText(name)
    }
    case 'title':
      return value === ctx.node.annotations?.title
        ? NONE
        : unsupported('Texaryn labels a field with the schema title; move the text into the schema.')
    case 'enableMarkdownInDescription':
      return value === true && (described || ctx.options.has('description'))
        ? unsupported('Texaryn renders a description as plain text.')
        : NONE
    case 'label':
      return value === false ? unsupported('Texaryn always renders the label.') : NONE
    case 'classNames':
    case 'style':
      return unsupported('Texaryn has no styling hook per location; style the widget registered for it.')
    case 'disabled':
      return value === true ? unsupported('Texaryn has no disabled hint, so the field stays editable.') : NONE
    case 'readonly':
      return value === true && !ctx.readOnly
        ? unsupported('Texaryn takes read-only from the schema; declare readOnly there.')
        : NONE
    case 'hideError':
      return value === true ? unsupported('Texaryn always renders the errors of a field.') : NONE
    case 'autofocus':
      return value === true ? unsupported('Texaryn has no autofocus hint.') : NONE
    case 'autocomplete':
    case 'inputType':
      return ctx.kind === 'string' || ctx.kind === 'number'
        ? unsupported(`Texaryn sets no ${name} on its inputs from a hint.`)
        : NONE
    case 'emptyValue':
      return ctx.kind === 'string' || ctx.kind === 'enum' || ctx.kind === 'number'
        ? unsupported('Texaryn writes its own value when the field is cleared.')
        : NONE
    case 'rows':
      return ctx.options.get('widget')?.value === 'textarea' && widgetOutcome('textarea', ctx.kind, ctx.node) === 'textarea'
        ? unsupported('The Texaryn textarea takes no row count.')
        : NONE
    case 'enumNames':
      return ctx.kind === 'enum' || ctx.kind === 'array' ? unsupported('Texaryn labels each option with its value.') : NONE
    case 'enumDisabled':
      return ctx.kind === 'enum' || ctx.kind === 'array' ? unsupported('Texaryn offers every option.') : NONE
    case 'addable':
      return ctx.kind === 'array' && value === false ? unsupported('Texaryn shows the add control until maxItems is reached.') : NONE
    case 'removable':
      return ctx.kind === 'array' && value === false
        ? unsupported('Texaryn shows the remove controls until minItems is reached.')
        : NONE
    case 'copyable':
      return ctx.kind === 'array' && value === true ? unsupported('Texaryn has no copy control.') : NONE
    case 'backstage':
      return unsupported('Backstage reads ui:backstage in its review and feature flag steps, outside the form.')
    case 'submitButtonOptions':
      return ctx.root ? unsupported('The submit control is rendered by the host, not the form.') : NONE
    default:
      return TEMPLATES.has(name)
        ? unsupported('Texaryn has no template slot per location; register a widget for it instead.')
        : NONE
  }
}

export function isInert(name: string, value: JsonValue): boolean {
  switch (name) {
    case 'placeholder':
    case 'description':
    case 'help':
    case 'title':
    case 'classNames':
    case 'style':
    case 'autocomplete':
    case 'inputType':
    case 'emptyValue':
    case 'rows':
    case 'enumNames':
    case 'enumDisabled':
    case 'order':
    case 'backstage':
    case 'field':
    case 'widget':
      return false
    case 'enableMarkdownInDescription':
    case 'disabled':
    case 'readonly':
    case 'hideError':
    case 'autofocus':
    case 'copyable':
    case 'orderable':
      return value !== true
    case 'label':
    case 'addable':
    case 'removable':
      return value !== false
    default:
      return !TEMPLATES.has(name)
  }
}
