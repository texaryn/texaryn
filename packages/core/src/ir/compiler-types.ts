import type { UIDocument } from './types.js'
import type { IdentityMap } from './runtime-state.js'
import type { UIHints } from '../hints/types.js'

export interface CompileResult {
  document: UIDocument
  identityMap: IdentityMap
}

export interface CompilerConfig {
  hints?: UIHints
}
