---
'@texaryn/vue': minor
---

`ErrorSummary` is a named group with an `h2` heading and takes focus once a
failed submit settles, once per attempt; a successful submit, a validation
exception and blur or change validation move nothing. `:focus="false"` keeps
it passive, for an application that renders one runtime twice and wants one
focusing summary. The heading and the text after each link come from
`errorSummaryHeading` and `errorSummaryDetail` in `FormMessages`.
