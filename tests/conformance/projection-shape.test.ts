import { projectionShapeSuite } from './projection-shape.suite.js'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createHyperjumpAdapter } from '@texaryn/schema-json-hyperjump'

projectionShapeSuite('json-schema-library', (schema) => createJsonSchemaAdapter(schema))
projectionShapeSuite('@hyperjump/json-schema', (schema) => createHyperjumpAdapter(schema))
