import { errorPointerConformanceSuite } from './error-pointer.suite.js'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createHyperjumpAdapter } from '@texaryn/schema-json-hyperjump'

errorPointerConformanceSuite('json-schema-library', (schema) => createJsonSchemaAdapter(schema))
errorPointerConformanceSuite('@hyperjump/json-schema', (schema) => createHyperjumpAdapter(schema))
