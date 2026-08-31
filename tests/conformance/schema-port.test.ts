import { schemaPortConformanceSuite } from './schema-port.suite.js'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createHyperjumpAdapter } from '@texaryn/schema-json-hyperjump'

schemaPortConformanceSuite('json-schema-library', (schema) => createJsonSchemaAdapter(schema))
schemaPortConformanceSuite('@hyperjump/json-schema', (schema) => createHyperjumpAdapter(schema))
