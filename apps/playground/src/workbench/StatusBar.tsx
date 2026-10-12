import type { ReactNode } from 'react'

function schemaIssueSentence(count: number | null): string {
  if (count === null || count === 0) return ''
  return count === 1 ? '1 schema error. Press F8 to go to it.' : `${count} schema errors. Press F8 to go to the next.`
}

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
      <span role="status">{schemaIssueSentence(schemaIssues)}</span>
      <span className="pg-status__end">
        {cursor && `Ln ${cursor.line}, Col ${cursor.column}`}
        {hint}
      </span>
    </footer>
  )
}
