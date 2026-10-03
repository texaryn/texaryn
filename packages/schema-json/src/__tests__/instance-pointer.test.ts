import { describe, it, expect } from 'vitest'
import { pointerResolver, type ReportedError } from '../instance-pointer.js'

const plain = (code = 'type-error', value?: unknown): ReportedError => ({ code, value })
const resolve = (data: unknown, pointer: string, reported: ReportedError = plain()) =>
  pointerResolver(data)(pointer, reported)

describe('pointerResolver', () => {
  it.each([
    ['the root', '#', {}, ''],
    ['a plain path', '#/a/b', { a: { b: 1 } }, '/a/b'],
    ['an array index', '#/a/1', { a: [0, 1] }, '/a/1'],
    ['a key with a slash', '#/a/b', { 'a/b': 1 }, '/a~1b'],
    ['a key with several slashes', '#/a/b/c', { 'a/b/c': 1 }, '/a~1b~1c'],
    ['a key with a tilde', '#/a~b', { 'a~b': 1 }, '/a~0b'],
    ['a key that spells an escape', '#/a~1b', { 'a~1b': 1 }, '/a~01b'],
    ['a slash key under a plain key', '#/p/q/r', { p: { 'q/r': 1 } }, '/p/q~1r'],
    ['a plain key under a slash key', '#/p/q/r', { 'p/q': { r: 1 } }, '/p~1q/r'],
    ['an empty key', '#/', { '': 1 }, '/'],
    ['an empty key above a plain key', '#//x', { '': { x: 1 } }, '//x'],
    ['a space and a percent sign', '#/a b/50%', { 'a b': { '50%': 1 } }, '/a b/50%'],
    ['an object inside an array', '#/xs/0/a/b', { xs: [{ 'a/b': 1 }] }, '/xs/0/a~1b'],
    ['a sparse array', '#/a/b/2', { 'a/b': [1, , 3] }, '/a~1b/2'],
  ])('%s', (_name, pointer, data, expected) => {
    expect(resolve(data, pointer)).toBe(expected)
  })

  it('escapes tildes and keeps slashes as separators when the data has no slash key', () => {
    expect(resolve({ a: 1 }, '#/properties/x~y')).toBe('/properties/x~0y')
    expect(resolve({}, '#/a/b')).toBe('/a/b')
  })

  it('does the same for a pointer that names no data location', () => {
    expect(resolve({ 'k/l': 1 }, '#/properties/x~y')).toBe('/properties/x~0y')
  })

  it('appends the escaped missing key of a required error to the located parent', () => {
    const data = { 'a/b': {} }
    expect(resolve(data, '#/a/b', { code: 'required-property-error', value: data['a/b'], missingKey: 'c/d' })).toBe(
      '/a~1b/c~1d',
    )
    expect(resolve({}, '#', { code: 'required-property-error', value: {}, missingKey: '' })).toBe('/')
  })

  describe('keys that read the same once joined', () => {
    const data = { 'a/b': { c: 'x' }, a: { 'b/c': 'y' } }

    it('takes the reading whose value is the reported value', () => {
      expect(resolve(data, '#/a/b/c', plain('type-error', 'x'))).toBe('/a~1b/c')
      expect(resolve(data, '#/a/b/c', plain('type-error', 'y'))).toBe('/a/b~1c')
    })

    it('takes the reading whose parent is the reported value', () => {
      const root = { a: { b: 1 }, 'a/b': 1 }
      expect(resolve(root, '#/a/b', { code: 'no-additional-properties-error', value: root, lastKey: 'a/b' })).toBe(
        '/a~1b',
      )
      expect(resolve(root, '#/a/b', { code: 'no-additional-properties-error', value: root.a, lastKey: 'b' })).toBe(
        '/a/b',
      )
      const arrays = { 'a/b': [1, 2], a: { b: [3, 4] } }
      const extra = (value: unknown): ReportedError => ({ code: 'additional-items-error', value, lastKey: '1' })
      expect(resolve(arrays, '#/a/b/1', extra(arrays['a/b']))).toBe('/a~1b/1')
      expect(resolve(arrays, '#/a/b/1', extra(arrays.a.b))).toBe('/a/b/1')
    })

    it('takes the reading whose JSON text is the reported value', () => {
      const items = { 'a/b': [1], a: { b: [2] } }
      expect(resolve(items, '#/a/b/0', plain('unevaluated-items-error', '1'))).toBe('/a~1b/0')
      expect(resolve(items, '#/a/b/0', plain('unevaluated-items-error', '2'))).toBe('/a/b/0')
    })

    it('gives equal valued errors their own reading, in data order', () => {
      const twins = { 'a/b': { c: 'x' }, a: { 'b/c': 'x' } }
      const next = pointerResolver(twins)
      const error = plain('type-error', 'x')
      expect([next('#/a/b/c', error), next('#/a/b/c', error), next('#/a/b/c', error)]).toEqual([
        '/a~1b/c',
        '/a/b~1c',
        '/a~1b/c',
      ])
    })

    it('takes the first reading when nothing tells them apart', () => {
      expect(resolve(data, '#/a/b/c', plain('type-error', 'z'))).toBe('/a~1b/c')
    })
  })

  describe('hostile data', () => {
    it('resolves a key made of 40000 slashes', () => {
      const data = JSON.parse(`{"${'/'.repeat(40000)}":1}`)
      const started = Date.now()
      expect(resolve(data, `#/${'/'.repeat(40000)}`)).toBe(`/${'~1'.repeat(40000)}`)
      expect(Date.now() - started).toBeLessThan(2000)
    })

    it('resolves a chain of 3000 nested objects, with and without a slash key', () => {
      let plainChain: Record<string, unknown> = {}
      let slashChain: Record<string, unknown> = { 'x/y': 1 }
      for (let depth = 0; depth < 3000; depth += 1) {
        plainChain = { k: plainChain }
        slashChain = { k: slashChain }
      }
      const pointer = `#${'/k'.repeat(3000)}`
      const started = Date.now()
      expect(resolve(plainChain, pointer)).toBe('/k'.repeat(3000))
      expect(resolve(slashChain, pointer)).toBe('/k'.repeat(3000))
      expect(Date.now() - started).toBeLessThan(2000)
    })

    it('stops at a circular reference and keeps slashes as separators', () => {
      const data: Record<string, unknown> = { 'x/y': 1 }
      data.self = data
      expect(resolve(data, '#/self/x/y')).toBe('/self/x/y')
    })

    it('answers for keys that collide with Object.prototype', () => {
      const data = JSON.parse('{"__proto__/a":1,"constructor":{"toString/x":2}}')
      expect(resolve(data, '#/__proto__/a')).toBe('/__proto__~1a')
      expect(resolve(data, '#/constructor/toString/x')).toBe('/constructor/toString~1x')
    })
  })
})
