---
'@texaryn/core': patch
---

Stops `dispatch` from tearing down validation for a command that then throws.

`dispatch` invalidated the validation scheduler before running the command, on
the assumption that a dispatched command always happens. Since the pointer
write began refusing to write through a value that cannot hold a property, one
does not, and the two steps disagreed: `invalidate` bumps the epoch, which is
how an in-flight validation result is recognised as stale and dropped without
calling back, and everything that would repair the state runs past the throw.

The result was not a lost update but a wedged form. With a validation in
flight, a refused write left the submission at `validating` and its nodes at
`pending` permanently, with no writer left to move them, and a later `Submit`
could not recover it because the submission was already `validating`.

Every side effect now happens after the handler returns, so nothing observable
is torn down for a command that turns out not to happen. A refused write
changed no data, so the validation already running against that unchanged data
is left to finish.
