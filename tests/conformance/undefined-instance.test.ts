import { undefinedInstanceSuite } from './undefined-instance.suite.js'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createHyperjumpAdapter } from '@texaryn/schema-json-hyperjump'

undefinedInstanceSuite('json-schema-library', (schema) => createJsonSchemaAdapter(schema))
undefinedInstanceSuite('@hyperjump/json-schema', (schema) => createHyperjumpAdapter(schema))
