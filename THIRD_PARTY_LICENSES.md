# Third-Party Components And Attributions

This document summarizes the main third-party components used by MarkProof. Original source
code in this repository is covered by the MIT License in [LICENSE](LICENSE). Third-party
packages retain their own licenses.

MarkProof is local-first and makes no runtime network requests to third-party services.

## Production Dependencies

| Package          | Use                                | License | Repository                                 |
| ---------------- | ---------------------------------- | ------- | ------------------------------------------ |
| `better-sqlite3` | Local SQLite access                | MIT     | https://github.com/WiseLibs/better-sqlite3 |
| `d3`             | Evidence timeline visualization    | ISC     | https://github.com/d3/d3                   |
| `exifr`          | Image and EXIF metadata extraction | MIT     | https://github.com/MikeKovarik/exifr       |
| `pdf-lib`        | PDF bundle generation              | MIT     | https://github.com/Hopding/pdf-lib         |
| `pdf-parse`      | PDF text extraction                | MIT     | https://gitlab.com/autokent/pdf-parse      |
| `react`          | Renderer UI                        | MIT     | https://github.com/facebook/react          |
| `react-dom`      | Renderer UI                        | MIT     | https://github.com/facebook/react          |

Electron is used as the desktop runtime. Electron itself is MIT licensed and bundles Chromium
and Node.js components that retain their respective upstream licenses.

The SQLite library used below `better-sqlite3` is public domain:
https://www.sqlite.org/copyright.html

## Build-Time Dependencies

Build-time tooling includes Electron/Vite tooling, TypeScript, ESLint, Prettier, Tailwind CSS,
Vitest, and related type packages. These are used to build and test the app and are not MarkProof
runtime services.

| Package                | License    | Repository                                             |
| ---------------------- | ---------- | ------------------------------------------------------ |
| `@vitejs/plugin-react` | MIT        | https://github.com/vitejs/vite-plugin-react            |
| `electron`             | MIT        | https://github.com/electron/electron                   |
| `electron-builder`     | MIT        | https://github.com/electron-userland/electron-builder  |
| `electron-vite`        | MIT        | https://github.com/alex8088/electron-vite              |
| `eslint`               | MIT        | https://github.com/eslint/eslint                       |
| `prettier`             | MIT        | https://github.com/prettier/prettier                   |
| `tailwindcss`          | MIT        | https://github.com/tailwindlabs/tailwindcss            |
| `typescript`           | Apache-2.0 | https://github.com/microsoft/TypeScript                |
| `typescript-eslint`    | MIT        | https://github.com/typescript-eslint/typescript-eslint |
| `vite`                 | MIT        | https://github.com/vitejs/vite                         |
| `vitest`               | MIT        | https://github.com/vitest-dev/vitest                   |

## External Services

None. MarkProof does not use cloud sync, telemetry, remote LLM inference, registry APIs, or a
remote database at runtime.

## Algorithms And Standards

- SHA-256 hashing uses Node.js `crypto`.
- PDF parsing follows PDF structure handled by `pdf-parse`.
- PDF generation is handled by `pdf-lib`.
- EXIF metadata parsing is handled by `exifr`.
- Magic-byte validation is implemented locally for PDF, JPEG, and PNG imports.

## Notes

This file is a human-readable attribution summary for a portfolio project. Before distributing
a production build, generate and review a complete transitive dependency license report from the
actual lockfile and packaged artifacts.
