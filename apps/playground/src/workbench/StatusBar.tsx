import type { ReactNode } from 'react'

export function schemaIssueSentence(count: number | null, keyboard = true): string {
  if (count === null || count === 0) return ''
  if (!keyboard) return count === 1 ? '1 schema error.' : `${count} schema errors.`
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
      <span>{schemaIssueSentence(schemaIssues)}</span>
      <span className="pg-status__end">
        {cursor && `Ln ${cursor.line}, Col ${cursor.column}`}
        {hint}
      </span>
    </footer>
  )
}
