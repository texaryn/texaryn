---
'@texaryn/core': minor
---

`FormMessages` gains `errorSummaryHeading({ count })` and
`errorSummaryDetail({ messages })`: the heading over the error summary and the
whole text after each item's link, punctuation included. A translated
application implements both; this is the breaking addition ADR-004 rule 3
describes, and the English forms are the migration:

    errorSummaryHeading: ({ count }) => (count === 1 ? 'There is a problem' : `There are ${count} problems`),
    errorSummaryDetail: ({ messages }) => `: ${messages.join(', ')}`,

`createFailedSubmitTracker(initial)` decides, from `submission` and
`visibleErrors` snapshots, when a summary focuses: once per accepted attempt
that settles invalid, never for an attempt older than the tracker, never
after a validation exception, and again after a Reset. Every binding's
summary uses it.

`SubmissionState` gains an optional `cancelled` mark, set when a data command
arrives during submit validation and abandons the attempt; the tracker
consumes such an attempt without focusing.
