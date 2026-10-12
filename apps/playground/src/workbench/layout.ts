import { useEffect, useReducer } from 'react'

export type PaneId = 'schema' | 'preview' | 'inspector'
export type PreviewWidth = 'phone' | 'tablet' | 'fit'

export interface LayoutState {
  version: 1
  inspectorCollapsed: boolean
  examplesCollapsed: boolean
  maximized: PaneId | null
  focus: boolean
  previewWidth: PreviewWidth
}

export const DEFAULT_LAYOUT: LayoutState = {
  version: 1,
  inspectorCollapsed: false,
  examplesCollapsed: false,
  maximized: null,
  focus: false,
  previewWidth: 'fit',
}

export type LayoutAction =
  | { type: 'toggleInspector' }
  | { type: 'setInspectorCollapsed'; collapsed: boolean }
  | { type: 'toggleExamples' }
  | { type: 'setExamplesCollapsed'; collapsed: boolean }
  | { type: 'maximize'; pane: PaneId }
  | { type: 'restore' }
  | { type: 'toggleFocus' }
  | { type: 'setPreviewWidth'; width: PreviewWidth }
  | { type: 'reset' }

export function layoutReducer(state: LayoutState, action: LayoutAction): LayoutState {
  switch (action.type) {
    case 'toggleInspector':
      return { ...state, inspectorCollapsed: !state.inspectorCollapsed }
    case 'setInspectorCollapsed':
      return { ...state, inspectorCollapsed: action.collapsed }
    case 'toggleExamples':
      return { ...state, examplesCollapsed: !state.examplesCollapsed }
    case 'setExamplesCollapsed':
      return { ...state, examplesCollapsed: action.collapsed }
    case 'maximize':
      return state.maximized === action.pane
        ? { ...state, maximized: null }
        : { ...state, maximized: action.pane, focus: false }
    case 'restore':
      return { ...state, maximized: null, focus: false }
    case 'toggleFocus':
      return { ...state, focus: !state.focus, maximized: null }
    case 'setPreviewWidth':
      return { ...state, previewWidth: action.width }
    case 'reset':
      return DEFAULT_LAYOUT
  }
}

export type WorkbenchView = { kind: 'panels' } | { kind: 'focus' } | { kind: 'maximized'; pane: PaneId }

export function activeView(state: LayoutState): WorkbenchView {
  if (state.maximized) return { kind: 'maximized', pane: state.maximized }
  if (state.focus) return { kind: 'focus' }
  return { kind: 'panels' }
}

export const LAYOUT_STORAGE_KEY = 'texaryn-playground-layout'
const PANES: readonly PaneId[] = ['schema', 'preview', 'inspector']
const WIDTHS: readonly PreviewWidth[] = ['phone', 'tablet', 'fit']

export function parseStoredLayout(raw: string | null): LayoutState {
  if (raw === null) return DEFAULT_LAYOUT
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return DEFAULT_LAYOUT
  }
  if (typeof value !== 'object' || value === null) return DEFAULT_LAYOUT
  const stored = value as Record<string, unknown>
  if (stored.version !== 1) return DEFAULT_LAYOUT
  const flag = (key: keyof LayoutState, fallback: boolean): boolean =>
    typeof stored[key] === 'boolean' ? (stored[key] as boolean) : fallback
  return {
    version: 1,
    inspectorCollapsed: flag('inspectorCollapsed', DEFAULT_LAYOUT.inspectorCollapsed),
    examplesCollapsed: flag('examplesCollapsed', DEFAULT_LAYOUT.examplesCollapsed),
    maximized: PANES.includes(stored.maximized as PaneId) ? (stored.maximized as PaneId) : null,
    focus: flag('focus', DEFAULT_LAYOUT.focus),
    previewWidth: WIDTHS.includes(stored.previewWidth as PreviewWidth)
      ? (stored.previewWidth as PreviewWidth)
      : DEFAULT_LAYOUT.previewWidth,
  }
}

export function readStoredLayout(): LayoutState {
  try {
    return parseStoredLayout(window.localStorage.getItem(LAYOUT_STORAGE_KEY))
  } catch {
    return DEFAULT_LAYOUT
  }
}

export function writeStoredLayout(state: LayoutState): void {
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage can be unavailable; the layout still applies to this page.
  }
}

export const PANEL_STORAGE_PREFIX = 'texaryn-playground-panels:'

function isPanelSizes(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((size) => typeof size === 'number' && Number.isFinite(size))
  )
}

export const panelStorage = {
  // react-resizable-panels 4.14.4 parses this value without a try, so only well formed sizes reach it.
  getItem(key: string): string | null {
    try {
      const stored = window.localStorage.getItem(PANEL_STORAGE_PREFIX + key)
      return stored !== null && isPanelSizes(JSON.parse(stored)) ? stored : null
    } catch {
      return null
    }
  },
  setItem(key: string, value: string): void {
    try {
      window.localStorage.setItem(PANEL_STORAGE_PREFIX + key, value)
    } catch {
      // As above.
    }
  },
}

export function clearStoredPanelSizes(): void {
  try {
    const keys: string[] = []
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index)
      if (key?.startsWith(PANEL_STORAGE_PREFIX)) keys.push(key)
    }
    for (const key of keys) window.localStorage.removeItem(key)
  } catch {
    // As above.
  }
}

export function useLayout(): [LayoutState, (action: LayoutAction) => void] {
  const [state, dispatch] = useReducer(layoutReducer, undefined, readStoredLayout)
  useEffect(() => {
    writeStoredLayout(state)
  }, [state])
  return [state, dispatch]
}
