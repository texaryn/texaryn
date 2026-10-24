import { undefinedInstanceSuite } from './undefined-instance.suite.js'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createHyperjumpAdapter } from '@texaryn/schema-json-hyperjump'

undefinedInstanceSuite('json-schema-library', (schema) => createJsonSchemaAdapter(schema)) // NOSONAR The shared harness registers this file's tests.
undefinedInstanceSuite('@hyperjump/json-schema', (schema) => createHyperjumpAdapter(schema)) // NOSONAR The shared harness registers this file's tests.
