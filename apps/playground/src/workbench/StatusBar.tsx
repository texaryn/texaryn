import type { ReactNode } from 'react'

export function StatusBar({
  dialect,
  parseError,
  pending,
  schemaIssues = null,
  cursor = null,
  hint,
}: {
  dialect: string
  parseError: string | null
  pending: boolean
  schemaIssues?: number | null
  cursor?: { line: number; column: number } | null
  hint?: ReactNode
}) {
  return (
    <footer className="pg-status" aria-label="Status">
      <span>{dialect}</span>
      <span>{parseError ? 'JSON error' : pending ? 'Applying…' : 'JSON valid'}</span>
      {schemaIssues !== null && <span>{schemaIssues === 1 ? '1 schema error' : `${schemaIssues} schema errors`}</span>}
      <span className="pg-status__end">
        {cursor && `Ln ${cursor.line}, Col ${cursor.column}`}
        {hint}
      </span>
    </footer>
  )
}
