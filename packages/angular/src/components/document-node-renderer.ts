import { NgComponentOutlet } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, forwardRef, input } from '@angular/core'
import type { DisplayActionNode, ListNode, TableNode } from '@texaryn/core'
import type { Type } from '@angular/core'
import type { NodeId } from '@texaryn/core'
import { useDocumentContext } from '../document-context.js'
import { useDynamicStore } from '../store.js'
import type { AngularDocumentWidget } from '../widget.js'

@Component({
  selector: 'texaryn-document-node-renderer',
  standalone: true,
  imports: [
    NgComponentOutlet,
    forwardRef(() => DocumentListView),
    forwardRef(() => DocumentTableView),
    forwardRef(() => DocumentNodeRenderer),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (node(); as current) {
      @if (component(); as selected) {
        <ng-container *ngComponentOutlet="selected; inputs: componentInputs()" />
      } @else {
        @switch (current.type) {
          @case ('container') {
            @if (current.containerType === 'group') {
              <fieldset>
                <legend>{{ current.annotations.title }}</legend>
                @for (childId of current.children; track childId) {
                  <texaryn-document-node-renderer [nodeId]="childId" />
                }
              </fieldset>
            } @else {
              <div data-texaryn-layout="">
                @for (childId of current.children; track childId) {
                  <texaryn-document-node-renderer [nodeId]="childId" />
                }
              </div>
            }
          }
          @case ('text') {
            @switch (current.textRole) {
              @case ('heading') { <h2>{{ current.content }}</h2> }
              @case ('help') { <p role="note">{{ current.content }}</p> }
              @default { <p>{{ current.content }}</p> }
            }
          }
          @case ('list') { <texaryn-document-list-view [node]="current" /> }
          @case ('table') { <texaryn-document-table-view [node]="current" /> }
          @case ('action') {
            <button type="button" (click)="invoke(current)">{{ current.label }}</button>
          }
        }
      }
    }
  `,
})
export class DocumentNodeRenderer {
  readonly nodeId = input.required<NodeId>()
  private readonly context = useDocumentContext()
  readonly node = computed(() => this.context.document().nodes[this.nodeId()])
  readonly component = computed<Type<AngularDocumentWidget> | undefined>(() => {
    const node = this.node()
    return node ? this.context.registry()?.resolve(node) : undefined
  })
  readonly componentInputs = computed(() => ({ node: this.node()!, runtime: this.context.runtime() }))

  invoke(node: DisplayActionNode): void {
    void this.context.runtime().invokeAction(node.id).catch((error: unknown) => {
      const report = this.context.onActionError()
      if (report) report(error)
      else console.error(error)
    })
  }
}

@Component({
  selector: 'texaryn-document-list-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul>
      @for (row of rows(); track row.id) {
        <li>{{ row.value === null ? '' : row.value }}</li>
      }
    </ul>
  `,
})
export class DocumentListView {
  readonly node = input.required<ListNode>()
  private readonly context = useDocumentContext()
  readonly rows = useDynamicStore(() => this.context.runtime().getCollection(this.node().id), [])
}

@Component({
  selector: 'texaryn-document-table-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <table>
      <thead><tr>@for (column of node().columns; track column.id) { <th scope="col">{{ column.label }}</th> }</tr></thead>
      <tbody>
        @for (row of rows(); track row.id) {
          <tr>
            @for (column of node().columns; track column.id; let index = $index) {
              <td>{{ row.cells[index] === null ? '' : row.cells[index] }}</td>
            }
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class DocumentTableView {
  readonly node = input.required<TableNode>()
  private readonly context = useDocumentContext()
  readonly rows = useDynamicStore(() => this.context.runtime().getCollection(this.node().id), [])
}
