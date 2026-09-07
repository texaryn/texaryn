---
'@texaryn/react': minor
'@texaryn/react-bootstrap': minor
'@texaryn/react-mui': minor
'@texaryn/vue': minor
'@texaryn/web-components': minor
---

Keep each field's error container mounted as a live region instead of inserting it with the message already inside.

A region that appears together with its content is not reliably announced, which is what every binding did: React and Vue rendered nothing until an error existed, and Web Components kept the node but hid it, which takes it out of the accessibility tree just the same. The container now exists from mount, stays empty while the field is valid, and only its contents change.

It is `aria-live="polite" aria-atomic="true"` rather than `role="alert"`. This is a public semantic change: `ErrorProps` promised `role: 'alert'` and now carries the live-region attributes instead. Alert is assertive, and validation runs on change, blur and submit, so keeping it would have interrupted typing and spoken once per failing field on submit. `aria-describedby` stays conditional, pointing at the region only while it has something to say. `ErrorSummary` loses its `role="alert"` and keeps rendering conditionally, because the fields now announce their own errors and an aggregate region would repeat the same validation event.
