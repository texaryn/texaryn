import { describe, it, expect } from 'vitest'
import { initialScripts, lazyLeaks, measure, overLimit, LIMITS } from './check-playground-size.mjs'

const HTML = `<!doctype html><head>
<script type="module" crossorigin src="/texaryn/playground/assets/index-abc.js"></script>
<link rel="modulepreload" crossorigin href="/texaryn/playground/assets/vendor-def.js">
</head>`

describe('check-playground-size', () => {
  it('finds the entry script and its preloads', () => {
    expect(initialScripts(HTML)).toEqual([
      '/texaryn/playground/assets/index-abc.js',
      '/texaryn/playground/assets/vendor-def.js',
    ])
  })

  it('sums gzip sizes per group', () => {
    const files = {
      'index-abc.js': 'a'.repeat(1000),
      'vendor-def.js': 'b'.repeat(1000),
      'editor-1.js': 'c'.repeat(1000),
      'palette-2.js': 'd'.repeat(1000),
      'other-3.js': 'e'.repeat(1000),
    }
    const sizes = measure({ html: HTML, assets: Object.keys(files), read: (name) => files[name] })
    expect(sizes.initial).toBeGreaterThan(0)
    expect(sizes.editor).toBeGreaterThan(0)
    expect(sizes.palette).toBeGreaterThan(0)
  })

  it('reports zero for a group whose chunk does not exist yet', () => {
    const files = { 'index-abc.js': 'a', 'vendor-def.js': 'b' }
    const sizes = measure({ html: HTML, assets: Object.keys(files), read: (name) => files[name] })
    expect(sizes.palette).toBe(0)
    expect(overLimit(sizes)).toEqual([])
  })

  it('names every group over its limit', () => {
    expect(overLimit({ initial: LIMITS.initial + 1, editor: 0, palette: LIMITS.palette + 1 })).toEqual([
      'initial',
      'palette',
    ])
  })

  it('finds a lazy chunk the entry imports statically', () => {
    const lazy = {
      'index.html': { file: 'assets/index-a.js', isEntry: true, imports: ['_vendor.js'], dynamicImports: ['src/editor/SchemaEditor.tsx'] },
      '_vendor.js': { file: 'assets/vendor-b.js' },
      'src/editor/SchemaEditor.tsx': { file: 'assets/editor-c.js' },
    }
    expect(lazyLeaks(lazy)).toEqual([])
    const leaked = { ...lazy, '_vendor.js': { file: 'assets/vendor-b.js', imports: ['src/editor/SchemaEditor.tsx'] } }
    expect(lazyLeaks(leaked)).toEqual(['assets/editor-c.js'])
  })
})
