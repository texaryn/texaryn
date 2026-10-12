import { useEffect, useLayoutEffect, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Group, Panel, Separator, useDefaultLayout, usePanelRef } from 'react-resizable-panels'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import { activeView, panelStorage } from './layout.js'
import type { LayoutAction, LayoutState, PaneId } from './layout.js'
import { PaneSlot } from './pane-hosts.js'
import type { PaneHosts } from './pane-hosts.js'
import { MaximizeButton, PaneHeader } from './PaneHeader.js'

const TITLES: Record<PaneId, string> = { schema: 'Schema', preview: 'Preview', inspector: 'Inspector' }
const INSPECTOR_HEADER_PX = 32
const SAVE = { storage: panelStorage, onlySaveAfterUserInteractions: true } as const

function follow(ref: RefObject<PanelImperativeHandle | null>, expanded: boolean): void {
  const panel = ref.current
  if (!panel) return
  if (expanded && panel.isCollapsed()) panel.expand()
  if (!expanded && !panel.isCollapsed()) panel.collapse()
}

// The button that opens an overlay, for a Restore with no recorded opener
// (an overlay already open at mount or after a breakpoint crossing).
function fallbackTarget(left: string): HTMLElement | null {
  if (left === 'focus') return document.querySelector<HTMLElement>('[data-focus-toggle]')
  return document.querySelector<HTMLElement>(`[aria-label="Maximize ${left.replace('maximized:', '')}"]`)
}

export function Workbench({
  hosts,
  layout,
  dispatch,
  resetSignal,
  previewHeader,
  rail,
}: {
  hosts: PaneHosts
  layout: LayoutState
  dispatch: (action: LayoutAction) => void
  resetSignal: number
  previewHeader?: ReactNode
  rail?: ReactNode
}) {
  const view = activeView(layout)
  const examplesRef = usePanelRef()
  const topRef = usePanelRef()
  const schemaRef = usePanelRef()
  const previewRef = usePanelRef()
  const inspectorRef = usePanelRef()
  const columns = useDefaultLayout({ id: 'columns', ...SAVE })
  const rows = useDefaultLayout({ id: 'rows', ...SAVE })
  const split = useDefaultLayout({ id: 'split', ...SAVE })
  const focusSplit = useDefaultLayout({ id: 'focus-split', ...SAVE })
  const firstReset = useRef(resetSignal)

  const viewKey = view.kind === 'maximized' ? `maximized:${view.pane}` : view.kind
  const shownKey = useRef(viewKey)
  const opener = useRef<HTMLElement | null>(null)
  const overlayAction = useRef<HTMLButtonElement | null>(null)
  // Read during render: after commit the panels are inert and the opener has
  // already lost focus.
  if (viewKey !== shownKey.current) {
    const active = document.activeElement
    if (active instanceof HTMLElement && active !== document.body && !active.closest('.pg-overlay')) {
      opener.current = active
    } else if (shownKey.current === 'panels') {
      opener.current = null
    }
  }
  useEffect(() => {
    if (viewKey === shownKey.current) return
    const left = shownKey.current
    shownKey.current = viewKey
    if (viewKey === 'panels') {
      const target = opener.current?.isConnected ? opener.current : fallbackTarget(left)
      target?.focus()
      opener.current = null
    } else {
      overlayAction.current?.focus()
    }
  }, [viewKey])

  // A pane shown by an overlay leaves the panels, because a host has one parent.
  const inPanels = (pane: PaneId): boolean =>
    view.kind === 'panels' || (view.kind === 'focus' ? pane === 'inspector' : view.pane !== pane)

  const examplesSection = useRef<HTMLElement | null>(null)
  const expandExamples = useRef<HTMLButtonElement | null>(null)
  const collapseExamples = useRef<HTMLButtonElement | null>(null)
  const firstExamples = useRef(layout.examplesCollapsed)
  // Before the browser blurs a focused control inside the newly inert section.
  useLayoutEffect(() => {
    if (layout.examplesCollapsed === firstExamples.current) return
    firstExamples.current = layout.examplesCollapsed
    const active = document.activeElement
    const lost = !active || active === document.body
    if (layout.examplesCollapsed && (lost || examplesSection.current?.contains(active))) expandExamples.current?.focus()
    if (!layout.examplesCollapsed && lost) collapseExamples.current?.focus()
  }, [layout.examplesCollapsed])

  useEffect(() => {
    follow(examplesRef, !layout.examplesCollapsed)
    follow(inspectorRef, !layout.inspectorCollapsed)
  }, [layout.examplesCollapsed, layout.inspectorCollapsed])

  useEffect(() => {
    if (resetSignal === firstReset.current) return
    examplesRef.current?.resize(216)
    topRef.current?.resize('72')
    inspectorRef.current?.resize('28')
    schemaRef.current?.resize('46')
    previewRef.current?.resize('54')
  }, [resetSignal])

  const maximize = (pane: PaneId) => (
    <MaximizeButton pane={pane} label={TITLES[pane].toLowerCase()} maximized={false} dispatch={dispatch} />
  )

  return (
    <div className="pg-workbench">
      {layout.examplesCollapsed && view.kind === 'panels' && (
        <nav className="pg-rail" aria-label="Workbench">
          <button
            type="button"
            ref={expandExamples}
            className="pg-rail__button"
            aria-label="Expand examples"
            onClick={() => dispatch({ type: 'toggleExamples' })}
          >
            Examples
          </button>
          {rail}
        </nav>
      )}
      <div className="pg-workbench__panels" inert={view.kind !== 'panels'}>
        <Group orientation="horizontal" defaultLayout={columns.defaultLayout} onLayoutChanged={columns.onLayoutChanged}>
          <Panel
            id="examples"
            panelRef={examplesRef}
            defaultSize={216}
            minSize={160}
            collapsible
            collapsedSize={0}
            onResize={() => {
              const panel = examplesRef.current
              if (!panel || view.kind !== 'panels') return
              if (panel.isCollapsed() !== layout.examplesCollapsed) {
                dispatch({ type: 'setExamplesCollapsed', collapsed: panel.isCollapsed() })
              }
            }}
          >
            <section
              ref={examplesSection}
              className="pg-pane"
              data-pane="examples"
              aria-label="Example list"
              inert={layout.examplesCollapsed}
            >
              <PaneHeader
                title="Examples"
                actions={
                  <button
                    ref={collapseExamples}
                    type="button"
                    className="pg-pane__action"
                    aria-label="Collapse examples"
                    onClick={() => dispatch({ type: 'toggleExamples' })}
                  >
                    Collapse
                  </button>
                }
              />
              <PaneSlot host={hosts.examples} />
            </section>
          </Panel>
          <Separator className="pg-separator" aria-label="Resize examples and workspace" />
          <Panel id="main" minSize={604}>
            <Group orientation="vertical" defaultLayout={rows.defaultLayout} onLayoutChanged={rows.onLayoutChanged}>
              <Panel id="top" panelRef={topRef} defaultSize="72">
                <Group orientation="horizontal" defaultLayout={split.defaultLayout} onLayoutChanged={split.onLayoutChanged}>
                  <Panel id="schema" panelRef={schemaRef} defaultSize="46" minSize={280}>
                    <section className="pg-pane" data-pane="schema" aria-label="Schema">
                      <PaneHeader title="Schema" actions={maximize('schema')} />
                      {inPanels('schema') && <PaneSlot host={hosts.schema} />}
                    </section>
                  </Panel>
                  <Separator className="pg-separator" aria-label="Resize schema and preview" />
                  <Panel id="preview" panelRef={previewRef} defaultSize="54" minSize={320}>
                    <section className="pg-pane pg-pane--preview" data-pane="preview" aria-label="Preview">
                      <PaneHeader title="Preview" actions={maximize('preview')}>
                        {previewHeader}
                      </PaneHeader>
                      {inPanels('preview') && <PaneSlot host={hosts.preview} />}
                    </section>
                  </Panel>
                </Group>
              </Panel>
              <Separator className="pg-separator pg-separator--row" aria-label="Resize workspace and inspector" />
              <Panel
                id="inspector"
                panelRef={inspectorRef}
                defaultSize="28"
                minSize={120}
                collapsible
                collapsedSize={INSPECTOR_HEADER_PX}
                onResize={() => {
                  const panel = inspectorRef.current
                  if (!panel || view.kind !== 'panels') return
                  if (panel.isCollapsed() !== layout.inspectorCollapsed) {
                    dispatch({ type: 'setInspectorCollapsed', collapsed: panel.isCollapsed() })
                  }
                }}
              >
                <section className="pg-pane" data-pane="inspector" aria-label="Inspector">
                  <PaneHeader
                    title="Inspector"
                    actions={
                      <>
                        <button
                          type="button"
                          className="pg-pane__action"
                          aria-label={layout.inspectorCollapsed ? 'Expand inspector' : 'Collapse inspector'}
                          onClick={() => dispatch({ type: 'toggleInspector' })}
                        >
                          {layout.inspectorCollapsed ? 'Expand' : 'Collapse'}
                        </button>
                        {maximize('inspector')}
                      </>
                    }
                  />
                  <div className="pg-pane__body" inert={layout.inspectorCollapsed}>
                    {inPanels('inspector') && <PaneSlot host={hosts.inspector} />}
                  </div>
                </section>
              </Panel>
            </Group>
          </Panel>
        </Group>
      </div>

      {view.kind === 'maximized' && (
        <div className="pg-overlay" data-view="maximized">
          <section className="pg-pane" data-pane={view.pane} aria-label={TITLES[view.pane]}>
            <PaneHeader
              title={TITLES[view.pane]}
              actions={
                <MaximizeButton
                  pane={view.pane}
                  label={TITLES[view.pane].toLowerCase()}
                  maximized
                  dispatch={dispatch}
                  buttonRef={overlayAction}
                />
              }
            >
              {view.pane === 'preview' ? previewHeader : null}
            </PaneHeader>
            <PaneSlot host={hosts[view.pane]} />
          </section>
        </div>
      )}

      {view.kind === 'focus' && (
        <div className="pg-overlay" data-view="focus">
          <div className="pg-overlay__bar">
            <span>Focus</span>
            <button
              ref={overlayAction}
              type="button"
              className="pg-pane__action"
              onClick={() => dispatch({ type: 'restore' })}
            >
              Exit Focus
            </button>
          </div>
          <Group orientation="horizontal" defaultLayout={focusSplit.defaultLayout} onLayoutChanged={focusSplit.onLayoutChanged}>
            <Panel id="focus-schema" defaultSize="46" minSize={280}>
              <section className="pg-pane" aria-label="Schema">
                <PaneSlot host={hosts.schema} />
              </section>
            </Panel>
            <Separator className="pg-separator" aria-label="Resize schema and preview in Focus" />
            <Panel id="focus-preview" defaultSize="54" minSize={320}>
              <section className="pg-pane pg-pane--preview" aria-label="Preview">
                <PaneHeader title="Preview">{previewHeader}</PaneHeader>
                <PaneSlot host={hosts.preview} />
              </section>
            </Panel>
          </Group>
        </div>
      )}
    </div>
  )
}
