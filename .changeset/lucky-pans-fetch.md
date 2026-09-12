---
'@texaryn/core': minor
---

Accepts ADR-003 and wires its initialization pass to the runtime.

`FormRuntimeOptions.initialization: 'schema-defaults'` fills every reachable
location the schema declares a `default` for and the data leaves absent. The
default stays `'none'`: given `{}` the runtime's data is still `{}`, and
projection never mutates data.

A location is filled when it becomes reachable, so the pass runs again after
every edit that can change what is reachable. Clicking a discriminator fills the
branch it reveals, which is what the reference does and what the Backstage
template the adoption exercise uses needs.

Failure is delivered by call surface, because they can carry different things.
`createFormRuntime` returns a value, so a run that does not converge within its
budget **throws** and the caller never receives a runtime. `dispatch` returns
void and is typically called from an event handler, so it reports on the new
`FormRuntime.initialization` store instead. What is discarded there depends on
what the moment establishes: a `Reset` establishes a baseline, so it is refused
whole and nothing lands, while an ordinary edit establishes none, so the edit
lands and only the seeding is discarded.

`FormRuntime.initialization` holds an `InitializationReport` or `undefined` where
no policy is configured, carrying the locations left absent because their
applicable declarations disagreed and those left absent because filling would
have meant guessing or destroying.

It publishes a new report on every data-mutating dispatch under the policy, even
one where the pass wrote nothing, because each dispatch is a run and what a run
finds can change as the user types. Anything subscribed to it therefore updates
per edit.

Adding a member to `FormRuntime` breaks a hand-written implementation of it, such
as a test double, which has to supply `initialization`. Every value that comes
from `createFormRuntime` is unaffected.
