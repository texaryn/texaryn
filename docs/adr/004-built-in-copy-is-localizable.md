# ADR-004: Built-in Copy Is Localizable Through One Contract

## Status

Accepted. The three rendering families render from the contract, and the shared
renderer conformance suite asserts that one set of messages produces the same
accessible names, the same visible words and the same marker placement in all
of them, across a switch on a mounted form.

The published surface is `FormMessages` with its `ActionMessage`,
`IndicatorMessage`, `ItemActionContext` and `AddItemContext` types, plus
`englishMessages` and `mergeMessages`, all from `@texaryn/core`, and one
accessor per binding.

## Context

Texaryn renders four pieces of English that no schema supplied and no adopter
chose. They are the array control's add, remove and move-up buttons, and the
marker that tells a sighted reader a field is required. Every one of them is
written out three times, once per rendering family, and the wording is public
API in two packages.

An adopter whose application is not in English therefore cannot ship Texaryn's
built-in widgets as they are. That is the problem this contract exists to solve,
and the reason to solve it now rather than later is that the cost grows with
every string added. The error summary is the next item of work and would add
more.

### What the controls render today

Measured rather than recalled. Each action puts a short word on the button and
the distinguishing sentence on `aria-label`:

| Package | Visible | Accessible name |
| --- | --- | --- |
| `react`, `react-bootstrap`, `react-mui` | `Add`, `Remove` | from `addActionName`, `removeActionName` |
| `vue`, `web-components` | `Add`, `Remove`, `Up` | the three `*ActionName` helpers |

`(required)` appears in `react/src/components/FieldLabelContent.tsx`,
`vue/src/widgets/inputs.ts` and `web-components/src/fields.ts`.

Four messages and seven strings in total. The three accessible-name formatters
are written out three times each, in an `action-names.ts` that the three
families hold identical copies of, and `(required)` three times. The visible
words are written where each control is built, so `Add` and `Remove` appear five
times and `Up` twice, since React renders no reorder control.

### Why the two surfaces of one control are one decision

The short visible word and the long accessible name are not independent
strings. The accessible name contains the visible label on purpose, so that a
speech-input user who says the words they can see activates the control they
meant. That is WCAG's Label in Name, and this codebase already reasons about it
where the required marker is concerned.

A contract that exposed `label` and `accessibleName` as two unrelated entries
would let a translator satisfy each one sensibly and break the relation between
them, with nothing to catch it. So one formatter returns both, and the
containment becomes a property the conformance suite asserts.

### The note this overrides

`vue/src/action-names.ts` records that extraction waits for a boundary rather
than a copy count, and names localized wording as one such boundary. It also
records that putting English control copy in the headless runtime would be the
wrong home. The first half is why this change happens now. The second half is
narrowed rather than contradicted: `@texaryn/core` is the framework-neutral
layer, not the runtime alone. It already owns `UINode`, `RendererRegistry`,
`UIHints.placeholder` and `ArrayMeta.itemTitle`, which are presentation
vocabulary by any reading. What must not own copy is the runtime's state,
command and validation code, and rule 7 states that as a dependency direction
rather than as a preference.

## Decision

Built-in copy is a contract in `@texaryn/core`, implemented by every binding,
and replaceable whole by an adopter.

```ts
export interface ActionMessage {
  /** The word on the control. Short, because it repeats down a list. */
  label: string
  /** The control's accessible name. Must contain `label`. */
  accessibleName: string
}

export interface ItemActionContext {
  /** 1-based, as a person counts rows, and meant for display. */
  position: number
  /** The row's own title, which repeats across rows. */
  itemTitle?: string
  containerTitle?: string
}

export interface AddItemContext {
  /** The item template's title, not any existing row's. */
  itemTemplateTitle?: string
  containerTitle?: string
}

export interface IndicatorMessage {
  text: string
  placement: 'before' | 'after'
}

export interface FormMessages {
  addItem(context: AddItemContext): ActionMessage
  removeItem(context: ItemActionContext): ActionMessage
  moveItemUp(context: ItemActionContext): ActionMessage
  requiredIndicator(): IndicatorMessage
}
```

Core ships `englishMessages`, which is today's wording moved without change, and
`mergeMessages(base, overrides)` for the adopter who wants to reword one control
rather than translate the set.

### Rules

1. **Every piece of copy Texaryn invents is stated in `FormMessages`.** A string
   literal in a binding that a user can read is a defect, not a default.

2. **One message owns every surface of one control.** An action returns its
   visible label and its accessible name together, because the second must
   contain the first.

3. **A locale supplies a whole `FormMessages`.** The configuration a binding
   accepts is the full interface, so adding a message to Texaryn fails a
   translated application at compile time rather than leaking one English
   control into it. Partial replacement is available as `mergeMessages` and is
   named for what it is, which is rewording rather than translation.

4. **Grammatical structure belongs to the message.** A formatter decides whether
   a clause appears, where the required marker sits relative to the label, and
   how a position is written. Texaryn supplies facts and never a sentence with
   slots, because a slot encodes English word order.

5. **Accessibility structure belongs to the renderer.** Which surface is
   `aria-hidden`, which element carries `aria-required`, and what the accessible
   name is computed from are decisions a translator never makes. A message
   returns text and placement; it never returns markup or ARIA attributes.

6. **Messages are configuration, replaceable while a form is mounted.** A
   binding re-renders when the configured `FormMessages` value changes. Texaryn
   observes nothing captured inside the functions, so a formatter that closes
   over mutable state and returns different text for the same arguments is
   outside the contract.

7. **The runtime does not depend on the messages module.** Nothing under
   `packages/core/src/runtime`, `commands`, `state` or `schema` imports from
   `packages/core/src/messages`. The dependency runs one way, from bindings and
   from the module's own exports outward.

### How each binding delivers it

Each family already carries exactly one piece of per-form configuration to its
widgets, the DOM id prefix, and messages follow that route rather than inventing
a second one.

| Family | Channel | Accessor |
| --- | --- | --- |
| React | a context provided by `FormProvider`, memoised on the prop's identity | `useFormMessages(): FormMessages` |
| Vue | an injection from `provideFormRuntime`, provided as a computed | `useFormMessages(): ComputedRef<FormMessages>` |
| Web Components | a field on `RenderContext`, set from the element property | `ctx.messages` |

Three details are decided rather than left to implementation.

**React falls back to English when no provider is above it**, where
`useFormIdPrefix` throws. The reason they differ is that a missing id prefix has
no safe answer, since two forms would then collide, and a missing locale has
one.

**Vue provides a computed rather than a value** for the reason its renderer
registry already documents: Vue provides once, so a plain value freezes the tree
at whatever was configured when it mounted.

**Web Components need an explicit update path.** A locale change recompiles no
document, and the element's render guard returns early when the runtime and
registry identities are unchanged, so putting messages on the context alone
would run nothing. `Mount` gains `setMessages`, which updates the context and
reconciles the mounted tree in place. It does not unmount, because remounting
would discard focus, selection and caret position, which this package spends
real effort preserving.

`mountForm` moves from four positional parameters to an options object.
A fifth positional parameter is not undoable later at a lower price than now.

### What is removed

`removeActionName`, `moveUpActionName`, `addActionName` and
`REQUIRED_INDICATOR` leave the public API of `@texaryn/react` and
`@texaryn/vue`. Their documented purpose is letting a custom widget match the
built-in wording. Once wording is configurable, a function that returns English
whatever the configuration says serves that purpose wrongly: a custom widget
built on it stays English while the form around it translates, and nothing
reports the mismatch. `useFormMessages` replaces them and is the reason removal
is not merely a break.

`@texaryn/react-bootstrap` and `@texaryn/react-mui` read the accessor and never
import `englishMessages`, so a layered widget set inherits an adopter's
configuration by construction.

## What this costs

An adopter who translates Texaryn writes four functions. That is more than
editing four entries in a catalogue file, and it is the deliberate trade in
rule 4: a function can express a language whose plural, gender or word order
rules a template cannot, and the cost is paid in TypeScript rather than in a
format translators use.

The bridge to an existing stack is one call per message, and the guide shows it
for react-i18next and vue-i18n. Texaryn defines no message identifiers of its
own, so the adopter chooses keys that suit their catalogue.

Rule 3 means adding a message to Texaryn is a breaking change for a translated
application, which is the intended cost. The alternative silently ships one
English control.

## What stays open

**Validation messages are not covered.** They arrive from
`json-schema-library` through `ValidationError.message`, so they are the
evaluator's copy rather than Texaryn's. Translating them means either a message
layer over the port or a change upstream, and neither is decided here.

**The error summary's copy is decided in ADR-005**, which adds
`errorSummaryHeading` and `errorSummaryDetail` to the contract.

**No message identifier namespace is published.** Stable identifiers with typed
parameters, plus a `createFormMessages(t)` adapter, would give translation
management tooling what it wants: keys, source strings and descriptions. It is
deferred rather than rejected, because it is a second public contract to
maintain and no adopter has asked for one. Rule 3 already buys the
exhaustiveness half of its value. The condition for revisiting is an adopter who
cannot integrate through the bridge the guide documents.

**`moveItemDown` is not in the contract**, because no binding renders that
control. Reorder parity adds it, and `mergeMessages` is not how it arrives: rule
3 means it lands as a breaking change to `FormMessages`, which is correct.

**Text direction is the host document's.** Texaryn sets no `dir` attribute, and
this contract does not change that.

## Consequences

An application in one language configures nothing and sees exactly today's
wording, because `englishMessages` is that wording moved rather than rewritten.

An application in another language replaces the set once, near where its runtime
is created, and every built-in control in every family follows, including the
Bootstrap and MUI widget sets it did not configure separately.

Copy stops being triplicated, so the three families can no longer drift on the
wording, and the conformance suite is what holds that rather than review.

Two packages lose four public exports each, and `@texaryn/web-components`
changes a function signature, so React, Vue and Web Components take a breaking
minor. The two React widget sets ship again with updated peer ranges; their
array controls read both surfaces from the hook, so an adopter who configures
nothing sees the same DOM as before.

The seam exists before the error summary work adds copy, which was the ordering
this was scheduled for.

## Alternatives rejected

**A flat catalogue of template strings.** The obvious shape, and the one
translation tooling consumes directly. It is rejected because the English this
contract replaces already branches: the clause naming the array disappears
entirely when the array has no title, rather than leaving an empty slot. A
template catalogue therefore needs conditional syntax, which means shipping an
expression language, or a separate key per branch, which pushes the branching
into key names that Texaryn would then own. Rule 4 is the general form of the
objection.

**A single `translate(key, params)` adapter.** Smaller than a catalogue and it
matches what i18next and FormatJS expose. It is rejected for the same branching
reason, plus keys that no type checker can verify, so a renamed message fails at
runtime in whichever language nobody tested.

**Message identifiers and a `createFormMessages(t)` adapter alongside the
interface.** Not rejected on the merits, and recorded above under what stays
open. It solves a real problem, which is that translators cannot edit a
TypeScript file, and it is deferred because Texaryn would own a key namespace
forever to solve it speculatively.

**A seventh package, `@texaryn/intl`.** Honours the note in
`vue/src/action-names.ts` literally, and keeps core free of user-visible text.
It is rejected because four messages do not pay for a published package with its
own README, changelog, release entry and peer graph, and because rule 7 answers
the note's actual concern, which is the runtime owning copy rather than the
package doing so.

**Separate `label` and `accessibleName` messages.** Reads as more flexible. It
is rejected because the accessible name must contain the visible label, and two
independent entries let a translator break that relation while satisfying each
one on its own.

**A partial locale merged over English.** Convenient, and it is what most
libraries do. It is rejected as the configuration a locale uses, because the
failure it produces is the one this contract exists to prevent: a translated
application silently renders an English control the first time Texaryn adds a
message. It survives as `mergeMessages` for rewording, where the fallback is
what the caller wants.

**Reading messages once at mount.** Simpler in all three families, and it avoids
the Web Components update path entirely. It is rejected because changing
language would then require remounting the form, which discards focus, selection
and renderer-local state that this codebase works to preserve. Rule 6 bounds the
cost by making the contract reactive configuration replacement rather than
observation of whatever a formatter closes over.

**Keeping the old helpers as deprecated wrappers.** Cheaper for any existing
caller. It is rejected because a wrapper returning English regardless of
configuration is wrong rather than merely old, and a deprecation notice does not
say so at the moment it matters, which is when the rest of the form is
translated and one custom widget is not.

## Related

- ADR-003, for the pattern of deciding a contract before implementing it.
- `#103`, for the exported hook that exists because three widget sets needed one
  decision, which is the same shape of problem as three copies of one string.
- The Backstage adoption exercise, which measured that one of eleven `ui:widget`
  values maps, and recorded that a documented adapter layer from RJSF-style UI
  Schema may be worth more to adoption than another JSON Schema feature. Copy
  configuration is a smaller instance of the same claim.
