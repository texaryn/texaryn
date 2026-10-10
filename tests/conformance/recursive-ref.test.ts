import { recursiveRefParity, recursiveRefSuite } from './recursive-ref.suite.js'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createHyperjumpAdapter } from '@texaryn/schema-json-hyperjump'

const jsonSchemaLibrary = (schema: Record<string, unknown>) => createJsonSchemaAdapter(schema)
const hyperjump = (schema: Record<string, unknown>) => createHyperjumpAdapter(schema)

recursiveRefSuite('json-schema-library', jsonSchemaLibrary)
recursiveRefSuite('@hyperjump/json-schema', hyperjump)
recursiveRefParity(jsonSchemaLibrary, hyperjump)
