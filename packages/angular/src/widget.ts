import type { InputSignal, Type } from '@angular/core'
import type { DocumentNode, DocumentRuntime, UINode } from '@texaryn/core'

export interface AngularWidget {
  readonly node: InputSignal<UINode>
}

export type WidgetComponent = Type<AngularWidget>

export interface AngularDocumentWidget {
  readonly node: InputSignal<DocumentNode>
  readonly runtime: InputSignal<DocumentRuntime>
}

export type DocumentWidgetComponent = Type<AngularDocumentWidget>
