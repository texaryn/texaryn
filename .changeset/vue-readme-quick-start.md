---
'@texaryn/vue': patch
---

The README quick start creates the adapter in `main.ts` and passes it to `App`
as a prop, so the example renders as the root component without a `<Suspense>`
boundary. No code changes.
