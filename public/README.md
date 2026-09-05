# Texaryn brand assets

Ready-to-commit asset set for the Texaryn woven T/X mark.

## Repository layout

```text
assets/
├── logo/
│   ├── texaryn-mark.svg
│   ├── texaryn-mark-monochrome.svg
│   └── texaryn-mark-1024.png
└── source/
    ├── logo-horizontal-lockup.png
    ├── logo-mark-v1-teal-dark.png
    └── logo-mark-v2-cyan-light.png

public/
├── favicon.ico
├── favicon.svg
├── favicon-16x16.png
├── favicon-32x32.png
├── apple-touch-icon.png
├── android-chrome-192x192.png
├── android-chrome-512x512.png
├── site.webmanifest
└── snippets/
    └── head.html
```

`assets/logo/` is the canonical brand source, `assets/source/` keeps the PNG source explorations, and `public/` is the ready-to-drop website copy.

## HTML

Add the contents of `public/snippets/head.html` inside `<head>`.
