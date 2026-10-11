import type { InputSignal, Type } from '@angular/core'
import type { UINode } from '@texaryn/core'

export interface AngularWidget {
  readonly node: InputSignal<UINode>
}

export type WidgetComponent = Type<AngularWidget>
