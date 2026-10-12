import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_LAYOUT,
  LAYOUT_STORAGE_KEY,
  PANEL_STORAGE_PREFIX,
  activeView,
  clearStoredPanelSizes,
  layoutReducer,
  panelStorage,
  parseStoredLayout,
} from '../workbench/layout.js'

beforeEach(() => {
  window.localStorage.clear()
})

describe('layoutReducer', () => {
  it('maximizes a pane and toggles back on a second maximize', () => {
    const max = layoutReducer(DEFAULT_LAYOUT, { type: 'maximize', pane: 'schema' })
    expect(max.maximized).toBe('schema')
    expect(layoutReducer(max, { type: 'maximize', pane: 'schema' }).maximized).toBeNull()
  })

  it('keeps Focus and maximize exclusive', () => {
    const focused = layoutReducer(DEFAULT_LAYOUT, { type: 'toggleFocus' })
    const max = layoutReducer(focused, { type: 'maximize', pane: 'preview' })
    expect(max).toMatchObject({ focus: false, maximized: 'preview' })
    expect(layoutReducer(max, { type: 'toggleFocus' })).toMatchObject({ focus: true, maximized: null })
  })

  it('restores from both maximize and Focus without touching collapse state', () => {
    const collapsed = layoutReducer(DEFAULT_LAYOUT, { type: 'toggleInspector' })
    const max = layoutReducer(collapsed, { type: 'maximize', pane: 'inspector' })
    expect(layoutReducer(max, { type: 'restore' })).toMatchObject({
      maximized: null,
      focus: false,
      inspectorCollapsed: true,
    })
  })

  it('collapses and expands the example list', () => {
    const collapsed = layoutReducer(DEFAULT_LAYOUT, { type: 'toggleExamples' })
    expect(collapsed.examplesCollapsed).toBe(true)
    expect(layoutReducer(collapsed, { type: 'toggleExamples' }).examplesCollapsed).toBe(false)
  })

  it('sets the example list collapse state to a given value', () => {
    const collapsed = layoutReducer(DEFAULT_LAYOUT, { type: 'setExamplesCollapsed', collapsed: true })
    expect(collapsed.examplesCollapsed).toBe(true)
    expect(layoutReducer(collapsed, { type: 'setExamplesCollapsed', collapsed: true }).examplesCollapsed).toBe(true)
    expect(layoutReducer(collapsed, { type: 'setExamplesCollapsed', collapsed: false }).examplesCollapsed).toBe(false)
  })

  it('resets to the defaults', () => {
    const changed = layoutReducer(DEFAULT_LAYOUT, { type: 'setPreviewWidth', width: 'phone' })
    expect(layoutReducer(changed, { type: 'reset' })).toEqual(DEFAULT_LAYOUT)
  })
})

describe('activeView', () => {
  it('names the panels, Focus and a maximized pane', () => {
    expect(activeView(DEFAULT_LAYOUT)).toEqual({ kind: 'panels' })
    expect(activeView({ ...DEFAULT_LAYOUT, focus: true })).toEqual({ kind: 'focus' })
    expect(activeView({ ...DEFAULT_LAYOUT, maximized: 'preview' })).toEqual({ kind: 'maximized', pane: 'preview' })
  })
})

describe('stored layout', () => {
  it('falls back to the defaults for missing, corrupt or other-version data', () => {
    expect(parseStoredLayout(null)).toEqual(DEFAULT_LAYOUT)
    expect(parseStoredLayout('{not json')).toEqual(DEFAULT_LAYOUT)
    expect(parseStoredLayout(JSON.stringify({ ...DEFAULT_LAYOUT, version: 2 }))).toEqual(DEFAULT_LAYOUT)
  })

  it('keeps valid fields and replaces invalid ones', () => {
    const raw = JSON.stringify({ version: 1, inspectorCollapsed: true, maximized: 'nowhere', previewWidth: 'tablet' })
    expect(parseStoredLayout(raw)).toEqual({ ...DEFAULT_LAYOUT, inspectorCollapsed: true, previewWidth: 'tablet' })
  })

  it('namespaces panel sizes and clears only its own keys', () => {
    panelStorage.setItem('columns', '{"examples":20}')
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, '{}')
    expect(window.localStorage.getItem(`${PANEL_STORAGE_PREFIX}columns`)).toBe('{"examples":20}')
    clearStoredPanelSizes()
    expect(panelStorage.getItem('columns')).toBeNull()
    expect(window.localStorage.getItem(LAYOUT_STORAGE_KEY)).toBe('{}')
  })

  it('hands the panel library only well formed sizes', () => {
    for (const stored of ['{broken', 'null', '[20,80]', '{"examples":"20"}', '{"examples":null}']) {
      window.localStorage.setItem(`${PANEL_STORAGE_PREFIX}columns`, stored)
      expect(panelStorage.getItem('columns')).toBeNull()
    }
    window.localStorage.setItem(`${PANEL_STORAGE_PREFIX}columns`, '{"examples":20,"main":80}')
    expect(panelStorage.getItem('columns')).toBe('{"examples":20,"main":80}')
  })
})
