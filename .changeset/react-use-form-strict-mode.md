---
'@texaryn/react': patch
---

`useForm` works inside `<StrictMode>`, which Vite's React template and the
Next.js App Router turn on by default. In development StrictMode runs every
effect's cleanup and setup a second time, and that cleanup destroyed the
runtime, so the form ignored typing and Submit did nothing.

The destroy now waits one task after the cleanup and the repeated setup cancels
it, so the form keeps its mounted runtime and that runtime's state. A real
unmount still destroys the runtime, one task later: a test that expects
`runtime.destroy()` to have run right after `unmount()` has to wait for the
next task. Work in flight at unmount, for example a submit dispatched just
before the component unmounts, now completes if it settles within the next
task, instead of being dropped.
