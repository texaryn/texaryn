# ADR-005: The Error Summary Takes Focus After a Failed Submit

## Status

Accepted. React, Vue and Web Components render the same group and move focus
by the same rule, and the shared renderer conformance suite asserts it in all
five rendering families.

## Context

After #161 every family had the same error summary: a jump-linked list of the
runtime's visible errors, deliberately not a live region because each field
already announces its own errors. It had no heading and never received
focus. A sighted user sees the list appear; a keyboard or screen reader user
who submits an invalid form is told nothing and left where they were.

The summary needed a heading, a focus destination and a rule for when focus
moves, and ADR-004 had deferred the summary's copy to this decision so the
heading and the item text would enter `FormMessages` once, together.

## Decision

The summary container is `role="group"`, `tabindex="-1"` and labelled by its
own `h2`, which is its first child. Its accessible name is the heading text
alone.

Focus moves to the container once per accepted submit attempt that settles
invalid: `submission.attempts` has grown past the last attempt the summary
handled, the status is back to `idle` with no `error`, and `visibleErrors` is
not empty. A successful submit, a validation exception, and validation on
blur or change move nothing, and a summary already showing errors from blur
validation still focuses on the failed submit: the event is the attempt, not
the summary's appearance. The handled attempt is seeded when the summary is
created, so a summary mounted after an old failure never focuses
retroactively; a lower `attempts` after Reset rearms it. This rule lives once,
in core's `createFailedSubmitTracker`, and never observes the `validating`
state, so synchronous and asynchronous validation behave alike.

Every summary focuses by default. An application that renders one runtime
twice turns focus off on all but one (`focus={false}`, `:focus="false"`,
`error-summary="no-focus"`); two focusing summaries over one runtime is
unsupported.

`FormMessages` gains `errorSummaryHeading({ count })`, where `count` is the
number of summary items, and `errorSummaryDetail({ messages })`, the whole
text after an item's link including its punctuation. English says "There is a
problem" or "There are N problems", and ": " before the messages joined by
", ". A locale owns the punctuation: French puts a space before the colon.

The heading is an `h2` as a built-in policy, not as a claim about every host
document. A heading-level option, if one is ever needed, belongs to the
renderer, never to `FormMessages` (ADR-004 rule 5).

## Alternatives rejected

- `role="alert"` on the summary: assertive, and the fields already announce
  the same validation event.
- Focusing the heading: leaves the container unnamed and the list outside
  what the user just landed on.
- Focusing the first link: no framing, and no place for a heading.
- `region`: a landmark, which every form's error summary would add to
  landmark navigation.
- A plain `div` with `aria-labelledby`: `generic` is naming-prohibited.
- Arming the surface that holds focus when the attempt starts: no answer for
  a programmatic submit or a submit control outside the surface.
- Observing the transition from `validating` to `idle`: an implementation
  detail of the scheduler that a synchronous evaluator would skip.
- Returning a structure from `errorSummaryDetail`: whether several messages
  become a nested list is a structure the three renderers decide together, not
  a locale.

## Consequences

A translated application implements two more members, at compile time, which
is the cost ADR-004 rule 3 chose. An application in one language sees the
heading and the focus move with no configuration. The summary DOM survives a
locale switch and a validation refresh, so the focus it holds is not lost.
