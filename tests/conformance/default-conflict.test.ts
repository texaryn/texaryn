import { defaultConflictSuite } from './default-conflict.suite.js'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createHyperjumpAdapter } from '@texaryn/schema-json-hyperjump'

defaultConflictSuite('json-schema-library', (schema) => createJsonSchemaAdapter(schema))
defaultConflictSuite('@hyperjump/json-schema', (schema) => createHyperjumpAdapter(schema))
