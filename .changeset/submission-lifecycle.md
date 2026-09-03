---
'@texaryn/core': patch
---

Add submission lifecycle with snapshot semantics.
Submit captures the current form data as an immutable attempt. Validation
and onSubmit both operate on the captured snapshot, not live state.
Duplicate Submit while validating or submitting is a no-op. Edits during
submitting update the form but do not alter the in-flight payload or
trigger blur/change validation. Reset or destroy during an in-flight
submission cleanly cancels via a generation counter.
