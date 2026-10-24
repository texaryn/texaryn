import { FormRoot, createDefaultRegistry } from '@texaryn/react'
import type { RendererProps } from '../renderer-types.js'
import '../tailwind.css'

const registry = createDefaultRegistry()

const TAILWIND_SCOPE = [
  'space-y-3 font-sans text-sm text-[var(--tx-text)]',
  '[&_*]:box-border',
  '[&_label]:mb-1 [&_label]:block [&_label]:font-medium',
  '[&_input:not([type=checkbox])]:w-full [&_input:not([type=checkbox])]:rounded-md [&_input:not([type=checkbox])]:border [&_input:not([type=checkbox])]:border-[var(--tx-border-strong)] [&_input:not([type=checkbox])]:bg-[var(--tx-surface-raised)] [&_input:not([type=checkbox])]:px-3 [&_input:not([type=checkbox])]:py-2 [&_input:not([type=checkbox])]:text-[var(--tx-text)]',
  '[&_select]:w-full [&_select]:rounded-md [&_select]:border [&_select]:border-[var(--tx-border-strong)] [&_select]:bg-[var(--tx-surface-raised)] [&_select]:px-3 [&_select]:py-2 [&_select]:text-[var(--tx-text)]',
  '[&_textarea]:w-full [&_textarea]:rounded-md [&_textarea]:border [&_textarea]:border-[var(--tx-border-strong)] [&_textarea]:bg-[var(--tx-surface-raised)] [&_textarea]:px-3 [&_textarea]:py-2 [&_textarea]:text-[var(--tx-text)]',
  '[&_input[type=checkbox]+label]:ml-2 [&_input[type=checkbox]+label]:inline-block',
  '[&_fieldset]:rounded-lg [&_fieldset]:border [&_fieldset]:border-[var(--tx-border)] [&_fieldset]:p-4',
  '[&_legend]:px-2 [&_legend]:font-semibold',
  '[&_button]:mr-2 [&_button]:rounded-md [&_button]:border-0 [&_button]:bg-[var(--tx-accent)] [&_button]:px-3 [&_button]:py-2 [&_button]:text-[var(--tx-on-accent)]',
  '[&_[data-action=remove]]:bg-[var(--tx-danger)]',
  '[&_[aria-invalid=true]]:border-[var(--tx-danger)] [&_[role=alert]]:text-[var(--tx-danger)]',
  '[&_input:focus-visible]:outline-2 [&_select:focus-visible]:outline-2 [&_textarea:focus-visible]:outline-2 [&_button:focus-visible]:outline-2 [&_input:focus-visible]:outline-[var(--tx-accent)] [&_select:focus-visible]:outline-[var(--tx-accent)] [&_textarea:focus-visible]:outline-[var(--tx-accent)] [&_button:focus-visible]:outline-[var(--tx-accent)]',
].join(' ')

export default function ReactTailwindRenderer({ theme }: Readonly<RendererProps>) {
  return (
    <div
      className={TAILWIND_SCOPE}
      data-style-system="tailwind"
      data-theme={theme}
      data-testid="tailwind-style-scope"
    >
      <FormRoot registry={registry} />
    </div>
  )
}
