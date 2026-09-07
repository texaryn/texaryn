---
'@texaryn/react': minor
'@texaryn/react-bootstrap': minor
'@texaryn/react-mui': minor
'@texaryn/vue': minor
'@texaryn/web-components': minor
---

Show a required field's requirement to a sighted user, without announcing it twice.

Required was conveyed only through `aria-required`, so a sighted user had nothing to tell a required field from an optional one. Every required label now carries a visible `(required)`.

Three channels carry that one fact and are deliberately kept separate. The visible label reads "Full Name (required)". The accessible name stays exactly "Full Name", because the indicator is `aria-hidden` and `aria-required` already reports the state; putting it in the name as well makes some screen readers say it twice. WCAG's Label in Name allows exactly this omission when the state is surfaced programmatically.

The indicator is the word rather than an asterisk, so nothing has to be explained elsewhere on the form. `field.label` and `fieldLabel()` still return the raw schema title: the decoration lives in the label rendering, so a visual convention does not become the canonical field title a custom widget sees. React exposes `FieldLabelContent` so its three widget sets cannot drift, and each binding exports `REQUIRED_INDICATOR` so a custom widget can match the wording.
