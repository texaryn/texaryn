import { schemaPortConformanceSuite } from './schema-port.suite.js'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createHyperjumpAdapter } from '@texaryn/schema-json-hyperjump'

schemaPortConformanceSuite('json-schema-library', (schema) => createJsonSchemaAdapter(schema)) // NOSONAR The shared harness registers this file's tests.
schemaPortConformanceSuite('@hyperjump/json-schema', (schema) => createHyperjumpAdapter(schema)) // NOSONAR The shared harness registers this file's tests.
