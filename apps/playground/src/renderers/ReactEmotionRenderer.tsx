import styled from '@emotion/styled'
import { FormRoot, createDefaultRegistry } from '@texaryn/react'
import type { RendererProps } from '../renderer-types.js'

const registry = createDefaultRegistry()
const EmotionScope = styled.div<{ $mode: RendererProps['theme'] }>(({ $mode }) => ({
  color: 'var(--tx-text)',
  colorScheme: $mode,
  display: 'grid',
  gap: '0.75rem',
  '& label': {
    display: 'block',
    marginBottom: '0.25rem',
    fontSize: '0.875rem',
    fontWeight: 600,
  },
  '& input:not([type="checkbox"]), & select, & textarea': {
    boxSizing: 'border-box',
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: '1px solid var(--tx-border-strong)',
    borderRadius: '0.375rem',
    background: 'var(--tx-surface-raised)',
    color: 'var(--tx-text)',
    font: 'inherit',
  },
  '& input[type="checkbox"] + label': {
    display: 'inline-flex',
    alignItems: 'center',
    marginLeft: '0.5rem',
  },
  '& fieldset': {
    border: '1px solid var(--tx-border)',
    borderRadius: '0.5rem',
    padding: '1rem',
  },
  '& legend': { padding: '0 0.5rem', fontWeight: 600 },
  '& button': {
    marginRight: '0.5rem',
    border: 0,
    borderRadius: '0.375rem',
    padding: '0.5rem 0.75rem',
    background: 'var(--tx-accent)',
    color: 'var(--tx-on-accent)',
    font: 'inherit',
    cursor: 'pointer',
  },
  '& [aria-invalid="true"]': { borderColor: 'var(--tx-danger)' },
  '& [role="alert"]': { color: 'var(--tx-danger)' },
}))

export default function ReactEmotionRenderer({ theme }: RendererProps) {
  return (
    <EmotionScope $mode={theme} data-style-system="emotion" data-theme={theme}>
      <FormRoot registry={registry} />
    </EmotionScope>
  )
}
