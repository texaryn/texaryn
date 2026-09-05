---
title: What is Texaryn?
description: The layer between a declarative description of a domain and a framework-specific interface.
---

Texaryn sits between a declarative description of a domain and the interface a
particular framework renders for it. You describe what the data is; Texaryn
decides what the interface has to express; a renderer decides how it looks.

Forms are the first domain, and the intent is that they become excellent
before anything else is attempted.

## The pipeline

Every stage is a value you can inspect, and no stage below the binding knows
which framework will render it.

```text
Schema or domain description
          ↓
Schema evaluation
          ↓
SchemaProjection
          ↓
IR compiler
          ↓
UIDocument
          ↓
Deterministic runtime
          ↓
Renderer binding
          ↓
React, Vue
          ↓
Default, Bootstrap, Material UI
```

## Why the separation matters

A renderer receives a typed document rather than a schema, so a design system
integration never reimplements schema semantics. Conditionals, composition and
dependencies are resolved once, in one place, and every renderer inherits the
result.

That is also what makes the claim testable. The same example runs through
every supported renderer, so "framework neutral" is something the build
checks rather than something the README says.

## Status

This documentation site is new and still a shell. The written guides currently
live in the repository, and the API reference is generated separately. Both
move here as the site grows.
