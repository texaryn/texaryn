import { describe, it, expect, vi } from 'vitest'
import { getUiOptions } from '@rjsf/utils'
import type { JsonObject } from '../json.js'
import { effectiveOptions, globalOptions, plain } from '../options.js'

function values(ui: JsonObject, root: JsonObject = {}) {
  return plain(effectiveOptions(ui, '/x', globalOptions(root)))
}

function reference(ui: JsonObject, root: JsonObject = {}) {
  return getUiOptions(ui as never, (root['ui:globalOptions'] ?? {}) as never)
}

describe('effectiveOptions', () => {
  const cases: [string, JsonObject, JsonObject][] = [
    ['top level keys only', { 'ui:placeholder': 'a', 'ui:title': 'T' }, {}],
    ['ui:options after a top level key wins', { 'ui:placeholder': 'raw', 'ui:options': { placeholder: 'opt' } }, {}],
    ['a top level key after ui:options wins', { 'ui:options': { placeholder: 'opt' }, 'ui:placeholder': 'raw' }, {}],
    ['a non-object ui:options is an option named options', { 'ui:options': 'odd' }, {}],
    ['global options are the base', { 'ui:label': true }, { 'ui:globalOptions': { label: false, orderable: false } }],
    ['nesting keys name no option', { child: { 'ui:title': 'c' }, 'ui:help': 'h' }, {}],
  ]

  it.each(cases)('matches getUiOptions: %s', (_name, ui, root) => {
    expect(values(ui, root)).toEqual(reference(ui, root))
  })

  it('drops an object ui:widget as RJSF does', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ui = { 'ui:widget': { component: 'x' }, 'ui:title': 'T' }
    expect(values(ui)).toEqual(reference(ui))
    error.mockRestore()
  })

  it('names the spelling that won', () => {
    const early = effectiveOptions({ 'ui:placeholder': 'raw', 'ui:options': { placeholder: 'opt' } }, '/x', new Map())
    const late = effectiveOptions({ 'ui:options': { placeholder: 'opt' }, 'ui:placeholder': 'raw' }, '/x', new Map())
    expect(early.get('placeholder')).toEqual({ value: 'opt', path: '/x/ui:options/placeholder' })
    expect(late.get('placeholder')).toEqual({ value: 'raw', path: '/x/ui:placeholder' })
    const global = globalOptions({ 'ui:globalOptions': { label: false } })
    expect(effectiveOptions({}, '/x', global).get('label')).toEqual({ value: false, path: '/ui:globalOptions/label' })
  })

  it('orders options by their last write', () => {
    const options = effectiveOptions({ 'ui:title': 'a', 'ui:help': 'b', 'ui:options': { title: 'c' } }, '', new Map())
    expect([...options.keys()]).toEqual(['help', 'title'])
  })
})
