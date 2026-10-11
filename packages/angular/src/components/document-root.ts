import { ChangeDetectionStrategy, Component, forwardRef, input } from '@angular/core'
import type { DocumentNode, DocumentRuntime, RendererRegistry, UIDocumentV2 } from '@texaryn/core'
import type { Signal, Type } from '@angular/core'
import type { NodeId } from '@texaryn/core'
import { useDynamicStore } from '../store.js'
import { DOCUMENT_CONTEXT } from '../document-context.js'
import type { AngularDocumentWidget } from '../widget.js'
import { DocumentNodeRenderer } from './document-node-renderer.js'

const emptyDocument: UIDocumentV2 = { version: 2, rootId: '' as NodeId, nodes: {} }

@Component({
  selector: 'texaryn-document-root',
  standalone: true,
  imports: [DocumentNodeRenderer],
  providers: [{ provide: DOCUMENT_CONTEXT, useExisting: forwardRef(() => DocumentRoot) }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let current = document();
    @if (current.nodes[current.rootId]) {
      <texaryn-document-node-renderer [nodeId]="current.rootId" />
    }
  `,
})
export class DocumentRoot {
  readonly runtime = input.required<DocumentRuntime>()
  readonly registry = input<RendererRegistry<Type<AngularDocumentWidget>, DocumentNode> | undefined>(undefined)
  readonly onActionError = input<((error: unknown) => void) | undefined>(undefined)
  readonly document: Signal<UIDocumentV2> = useDynamicStore(() => this.runtime().document, emptyDocument)
}
