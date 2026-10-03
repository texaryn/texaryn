import { protoKeyConformanceSuite } from './proto-key.suite.js'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createHyperjumpAdapter } from '@texaryn/schema-json-hyperjump'

protoKeyConformanceSuite('json-schema-library', (schema) => createJsonSchemaAdapter(schema))
protoKeyConformanceSuite('@hyperjump/json-schema', (schema) => createHyperjumpAdapter(schema))
