import type { JsonObject, JsonValue } from './json.js'
import { define, isJsonObject, member } from './json.js'
import { append } from './pointer.js'

export interface Option {
  readonly value: JsonValue
  readonly path: string
}

export type Options = ReadonlyMap<string, Option>

export const GLOBAL_PATH = '/ui:globalOptions'

export function globalOptions(root: JsonObject): Options {
  const options = new Map<string, Option>()
  const global = member(root, 'ui:globalOptions')
  if (isJsonObject(global)) {
    for (const name of Object.keys(global)) {
      options.set(name, { value: global[name] as JsonValue, path: append(GLOBAL_PATH, name) })
    }
  }
  return options
}

export function effectiveOptions(ui: JsonObject, path: string, global: Options): Map<string, Option> {
  const options = new Map(global)
  const set = (name: string, option: Option): void => {
    options.delete(name)
    options.set(name, option)
  }
  for (const key of Object.keys(ui)) {
    if (!key.startsWith('ui:')) continue
    const value = ui[key] as JsonValue
    const at = append(path, key)
    if (key === 'ui:widget' && isJsonObject(value)) continue
    if (key === 'ui:options' && isJsonObject(value)) {
      for (const name of Object.keys(value)) set(name, { value: value[name] as JsonValue, path: append(at, name) })
      continue
    }
    set(key.slice(3), { value, path: at })
  }
  return options
}

export function isGlobal(option: Option): boolean {
  return option.path.startsWith(`${GLOBAL_PATH}/`)
}

export function plain(options: Options): Readonly<Record<string, JsonValue>> {
  const record: JsonObject = {}
  for (const [name, option] of options) define(record, name, option.value)
  return record
}
