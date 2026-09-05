# @texaryn/vue

## 0.1.0

### Minor Changes

- f002477: First release of `@texaryn/vue`: Vue 3 bindings over the same core the React packages use.
  
  Composables (`useForm`, `useField`, `useFieldArray`, `useStore`), provide/inject context, `FormRoot` and `NodeRenderer`, and a default widget set matching the React registry's tests and ranks.
  
  Two things work differently from `@texaryn/react`, and both follow from `setup` running once where a hook re-runs per render. `useStore` accepts a store or a getter and watches it. `useField` and `useFieldArray` take the node id as a ref or getter, which is what keeps a field attached to its own array item across a move rather than to the position it left. `useForm` and `useStore` require an active scope, because each owns something only teardown releases.
  
  The whole example catalog runs through this package in the conformance matrix, and the playground renders it over the same `FormRuntime` instance the React shell owns.
