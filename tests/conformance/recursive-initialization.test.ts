import { recursiveInitializationSuite } from './recursive-initialization.suite.js'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createHyperjumpAdapter } from '@texaryn/schema-json-hyperjump'

recursiveInitializationSuite('json-schema-library', (schema) => createJsonSchemaAdapter(schema)) // NOSONAR The shared harness registers this file's tests.
recursiveInitializationSuite('@hyperjump/json-schema', (schema) => createHyperjumpAdapter(schema)) // NOSONAR The shared harness registers this file's tests.
