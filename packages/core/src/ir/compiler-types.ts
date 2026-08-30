import type { UIDocument } from './types.js'
import type { IdentityMap } from './runtime-state.js'

export interface CompileResult {
  document: UIDocument
  identityMap: IdentityMap
}
