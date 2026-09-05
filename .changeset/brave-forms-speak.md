---
"@texaryn/core": minor
---

A failed Submit now shows its errors. Before, `showErrors` required a field to be touched, so submitting a form the user had not interacted with validated, failed, returned to idle and displayed nothing. `SubmissionState` gains `attempts`, the number of accepted Submit commands since creation or the last Reset, and a field's errors are shown once it is invalid and either touched or `attempts` is above zero. Reset returns `attempts` to zero.
