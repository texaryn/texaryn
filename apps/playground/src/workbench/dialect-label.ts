export function dialectLabel(schema: unknown): string {
  const declared =
    typeof schema === 'object' && schema !== null ? (schema as Record<string, unknown>).$schema : undefined
  if (typeof declared === 'string') {
    if (declared.includes('2020-12')) return 'Draft 2020-12'
    if (declared.includes('2019-09')) return 'Draft 2019-09'
    if (declared.includes('draft-07')) return 'Draft 7'
    if (declared.includes('draft-04')) return 'Draft 4'
    return 'Draft 7 (unrecognized $schema)'
  }
  return 'Draft 7 (no $schema)'
}
