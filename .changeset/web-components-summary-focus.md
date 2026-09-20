---
'@texaryn/web-components': minor
---

The error summary is a named group with an `h2` heading and takes focus once
a failed submit settles, once per attempt; a successful submit, a validation
exception and blur or change validation move nothing.
`mountErrorSummary(container, form, { focus: false })` keeps it passive, for
an application that renders one runtime twice and wants one focusing summary,
and `ErrorSummaryMount.setMessages` follows a locale switch in place. `Mount`
exposes `messages`, the set in force. On the element, `error-summary` is
enumerated: present with any value other than `no-focus` focuses,
`error-summary="no-focus"` does not, and `errorSummaryFocus` reflects it. The
heading and the text after each link come from `errorSummaryHeading` and
`errorSummaryDetail` in `FormMessages`.
