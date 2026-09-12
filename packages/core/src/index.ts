export type {
  NodeId,
  StableItemId,
  JsonPointer,
  MaybePromise,
  JsonSchemaType,
  ValidationResult,
  ValidationError,
  VisibleError,
} from './types.js'

export type {
  UIDocument,
  UINode,
  NodeBase,
  NodeAnnotations,
  FieldNode,
  FieldType,
  FieldConstraints,
  EnumOption,
  ContainerNode,
  ArrayMeta,
  TextNode,
  ActionNode,
  RuntimeState,
  NodeRuntimeState,
  ValidationState,
  InteractionState,
  SubmissionState,
  IdentityMap,
} from './ir/index.js'

export type { CompileResult } from './ir/index.js'
export { compile } from './ir/index.js'

export type {
  SchemaEvaluationPort,
  SchemaProjection,
  ProjectionDiagnostic,
  ProjectionDiagnosticCode,
  NodeProjection,
  ChildProjection,
  AnnotationSet,
} from './schema/index.js'

export type { UIHints, FieldHints, ArrayHints } from './hints/index.js'

export type { Store, WritableStore } from './state/index.js'
export { createStore } from './state/index.js'

export type { Command, Effect, CommandResult } from './commands/index.js'
export { processCommand } from './commands/index.js'

export type {
  FormRuntime,
  FormRuntimeOptions,
  InitializationPolicy,
  InitializationReport,
  NodeState,
} from './runtime/index.js'
export { createFormRuntime } from './runtime/index.js'

// The pass itself stays unexported. What a caller needs is what the report
// carries, which is why these two travel and `initializeDefaults` does not.
export type { DefaultConflict, DefaultRefusal } from './initialization/index.js'

export { getAtPointer, setAtPointer, parsePointer } from './json-pointer.js'

export {
  createIdentityMap,
  registerArray,
  insertItem,
  removeItem,
  moveItem,
  resolvePointer,
  reconcile,
  identityKey,
  ROOT_IDENTITY_KEY,
} from './identity/index.js'
export type { ReconcileOptions, IdentityKey, IdentitySegment } from './identity/index.js'

export type { WidgetTester, WidgetEntry, RendererRegistry } from './renderer/index.js'
export { createRendererRegistry } from './renderer/index.js'
