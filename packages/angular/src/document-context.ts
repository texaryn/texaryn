import { inject, InjectionToken } from '@angular/core'
import type { Signal, Type } from '@angular/core'
import type { DocumentNode, DocumentRuntime, RendererRegistry, UIDocumentV2 } from '@texaryn/core'
import type { AngularDocumentWidget } from './widget.js'

export interface AngularDocumentContext {
  readonly runtime: Signal<DocumentRuntime>
  readonly document: Signal<UIDocumentV2>
  readonly registry: Signal<RendererRegistry<Type<AngularDocumentWidget>, DocumentNode> | undefined>
  readonly onActionError: Signal<((error: unknown) => void) | undefined>
}

export const DOCUMENT_CONTEXT = new InjectionToken<AngularDocumentContext>('texaryn.angular.document-context')

export function useDocumentContext(): AngularDocumentContext {
  return inject(DOCUMENT_CONTEXT)
}
