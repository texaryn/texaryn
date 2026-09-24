---
'@texaryn/react': patch
---

`useForm` works inside `<StrictMode>`, which the Vite React template and
Next.js turn on by default. In development StrictMode runs every effect's
cleanup and setup a second time, and that cleanup destroyed the runtime, so the
form ignored typing and Submit did nothing.

The destroy now waits one task after the cleanup and the repeated setup cancels
it, so the form keeps a single live runtime and its state. A real unmount still
destroys the runtime, one task later: a test that expects `runtime.destroy()` to
have run right after `unmount()` has to wait for the next task.
