import { provisionalSelectionSuite } from './provisional-selection.suite.js'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createHyperjumpAdapter } from '@texaryn/schema-json-hyperjump'

provisionalSelectionSuite('json-schema-library', (schema) => createJsonSchemaAdapter(schema)) // NOSONAR The shared harness registers this file's tests.
provisionalSelectionSuite('@hyperjump/json-schema', (schema) => createHyperjumpAdapter(schema)) // NOSONAR The shared harness registers this file's tests.
