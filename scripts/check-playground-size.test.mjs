import { describe, it, expect } from 'vitest'
import { randomBytes } from 'node:crypto'
import { gzipSize, insideDist, lazyLeaks, measure, overLimit, LIMITS } from './check-playground-size.mjs'

const MANIFEST = {
  'index.html': {
    file: 'assets/index-a.js',
    isEntry: true,
    imports: ['_vendor.js'],
    dynamicImports: ['src/editor/SchemaEditor.tsx'],
  },
  '_vendor.js': { file: 'assets/vendor-b.js', imports: ['_util.js'] },
  '_util.js': { file: 'assets/util-c.js' },
  'src/editor/SchemaEditor.tsx': {
    file: 'assets/editor-d.js',
    isDynamicEntry: true,
    imports: ['_vendor.js', '_shared-x.js'],
  },
  '_shared-x.js': { file: 'assets/shared-x.js', imports: ['_util.js'] },
}

function reader(files) {
  return (file) => {
    if (!(file in files)) throw new Error(`unexpected read of ${file}`)
    return files[file]
  }
}

describe('check-playground-size', () => {
  it('measures the entry and everything it imports statically as the first load', () => {
    const files = {
      'assets/index-a.js': randomBytes(1000),
      'assets/vendor-b.js': randomBytes(2000),
      'assets/util-c.js': randomBytes(3000),
      'assets/editor-d.js': randomBytes(10),
      'assets/shared-x.js': randomBytes(10),
    }
    const sizes = measure({ manifest: MANIFEST, read: reader(files) })
    const expected = ['index-a', 'vendor-b', 'util-c'].reduce((total, name) => total + gzipSize(files[`assets/${name}.js`]), 0)
    expect(sizes.initial).toBe(expected)
  })

  it('counts a lazy shared chunk the editor imports in the editor group', () => {
    const files = {
      'assets/index-a.js': randomBytes(100),
      'assets/vendor-b.js': randomBytes(100),
      'assets/util-c.js': randomBytes(100),
      'assets/editor-d.js': randomBytes(100 * 1024),
      'assets/shared-x.js': randomBytes(60 * 1024),
    }
    const sizes = measure({ manifest: MANIFEST, read: reader(files) })
    expect(sizes.editor).toBe(gzipSize(files['assets/editor-d.js']) + gzipSize(files['assets/shared-x.js']))
    expect(overLimit(sizes)).toEqual(['editor'])
  })

  it('counts a chunk the entry and the editor both import only in the first load', () => {
    const files = {
      'assets/index-a.js': randomBytes(100),
      'assets/vendor-b.js': randomBytes(5000),
      'assets/util-c.js': randomBytes(7000),
      'assets/editor-d.js': randomBytes(300),
      'assets/shared-x.js': randomBytes(400),
    }
    const sizes = measure({ manifest: MANIFEST, read: reader(files) })
    expect(sizes.editor).toBe(gzipSize(files['assets/editor-d.js']) + gzipSize(files['assets/shared-x.js']))
    expect(sizes.initial).toBe(
      gzipSize(files['assets/index-a.js']) + gzipSize(files['assets/vendor-b.js']) + gzipSize(files['assets/util-c.js']),
    )
  })

  it('measures a palette entry under src/palette and reports zero without one', () => {
    const files = {
      'assets/index-a.js': 'a',
      'assets/vendor-b.js': 'b',
      'assets/util-c.js': 'c',
      'assets/editor-d.js': 'd',
      'assets/shared-x.js': 'x',
      'assets/palette-e.js': randomBytes(500),
    }
    expect(measure({ manifest: MANIFEST, read: reader(files) }).palette).toBe(0)
    const withPalette = {
      ...MANIFEST,
      'src/palette/CommandPalette.tsx': { file: 'assets/palette-e.js', isDynamicEntry: true, imports: ['_vendor.js'] },
    }
    expect(measure({ manifest: withPalette, read: reader(files) }).palette).toBe(gzipSize(files['assets/palette-e.js']))
  })

  it('names every group over its limit', () => {
    expect(overLimit({ initial: LIMITS.initial + 1, editor: 0, palette: LIMITS.palette + 1 })).toEqual([
      'initial',
      'palette',
    ])
  })

  it('refuses a manifest file outside the dist directory', () => {
    expect(insideDist('/site/dist', 'assets/index-a.js')).toBe('/site/dist/assets/index-a.js')
    for (const file of ['../secret.js', 'assets/../../secret.js', '/etc/passwd', '']) {
      expect(() => insideDist('/site/dist', file)).toThrow(/outside/)
    }
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
