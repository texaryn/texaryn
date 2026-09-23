import type { WidgetTester } from '@texaryn/core'
import type { UiSchemaConversion } from './convert.js'

export function componentTester(conversion: UiSchemaConversion, name: string, rank = 10): WidgetTester {
  return {
    rank,
    test: (node) => node.dataPointer !== null && conversion.uiSchemaAt(node.dataPointer)?.component === name,
  }
}
