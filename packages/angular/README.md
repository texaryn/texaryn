# @texaryn/angular

Angular signal bindings and default widgets for Texaryn.

The package renders the Texaryn runtime through standalone Angular components. It uses Angular signals to observe Texaryn stores. Schema projection, validation, and form commands stay in `@texaryn/core` and the selected schema adapter.

## Install

```sh
pnpm add @texaryn/core @texaryn/schema-json @texaryn/angular
```

Angular 20 or later is required. The consuming application supplies Angular as a peer dependency.

## Use

Create the schema adapter before the component is created. Call `createForm` from an Angular injection context, such as a component field initializer, so the runtime lifetime follows that component's `DestroyRef`.

```ts
import { Component } from '@angular/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createDefaultRegistry, createForm, FormRoot } from '@texaryn/angular'

const adapter = await createJsonSchemaAdapter({
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Name' },
    email: { type: 'string', format: 'email', title: 'Email' },
  },
  required: ['name'],
})

@Component({
  selector: 'app-profile-form',
  standalone: true,
  imports: [FormRoot],
  template: `
    <texaryn-form-root
      [form]="form"
      [registry]="registry"
      idPrefix="profile"
      [showErrorSummary]="true"
    />
  `,
})
export class ProfileForm {
  readonly form = createForm(adapter, { initialData: { name: '', email: '' } })
  readonly registry = createDefaultRegistry()
}
```

The `idPrefix` must be unique among Texaryn forms on the same page. This makes every label and error reference deterministic across server rendering and hydration.

## Custom widgets

Register standalone component classes that expose a required `node` input. Container components can inject `FORM_CONTEXT` through `useFormContext()` and render children with `NodeRenderer`.

```ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import type { UINode } from '@texaryn/core'
import type { AngularWidget } from '@texaryn/angular'

@Component({
  selector: 'app-custom-widget',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ node().annotations.title ?? node().id }}`,
})
export class CustomWidget implements AngularWidget {
  readonly node = input.required<UINode>()
}
```

## Angular Forms

The binding keeps Texaryn's runtime as the source of form data and validation. It does not create a second `FormGroup` or mirror values into Angular Forms. Use Angular controls directly in a custom Texaryn widget when an application needs a specialized control.
