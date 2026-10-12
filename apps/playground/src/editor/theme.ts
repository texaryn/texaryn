import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'

export const editorTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--tx-code-bg)', color: 'var(--tx-text)', fontSize: '13px' },
  '.cm-scroller': { fontFamily: 'var(--tx-font-mono)', lineHeight: '1.55' },
  '.cm-gutters': { backgroundColor: 'var(--tx-code-bg)', color: 'var(--tx-code-gutter)', border: 'none' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--tx-code-active-line)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'var(--tx-code-selection)',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--tx-text)' },
  '.cm-panels': { backgroundColor: 'var(--tx-surface-raised)', color: 'var(--tx-text)' },
  '.cm-textfield': {
    backgroundColor: 'var(--tx-surface)',
    color: 'var(--tx-text)',
    border: '1px solid var(--tx-border-strong)',
  },
  '.cm-button, .cm-button:active': {
    backgroundImage: 'none',
    backgroundColor: 'var(--tx-surface)',
    color: 'var(--tx-text)',
    border: '1px solid var(--tx-border-strong)',
  },
  '&.cm-focused': { outline: '2px solid var(--tx-accent)', outlineOffset: '-2px' },
  '.cm-tooltip': {
    backgroundColor: 'var(--tx-surface-raised)',
    border: '1px solid var(--tx-border-strong)',
    color: 'var(--tx-text)',
  },
})

export const editorHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.propertyName, color: 'var(--tx-code-key)' },
    { tag: tags.string, color: 'var(--tx-code-string)' },
    { tag: tags.number, color: 'var(--tx-code-number)' },
    { tag: [tags.bool, tags.null], color: 'var(--tx-code-keyword)' },
    { tag: [tags.brace, tags.squareBracket, tags.separator], color: 'var(--tx-text-muted)' },
  ]),
)
