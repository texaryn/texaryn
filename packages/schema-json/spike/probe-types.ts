export interface ProbeResult {
  library: string
  version: string
  criteria: Record<string, {
    pass: boolean | 'partial'
    notes: string
    data?: unknown
  }>
  errors: string[]
}
