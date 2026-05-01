# MarkProof

**MarkProof is a local desktop tool for structuring trademark proof-of-use evidence bundles
("Benutzungsnachweis") for attorney review under § 26 MarkenG and Art. 18 EUTMR.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Local First](https://img.shields.io/badge/Local--First-100%25-22C55E)](#local-first-design)
[![Electron + TypeScript](https://img.shields.io/badge/Electron-TypeScript-3178C6)](#tech-stack)
[![Hallucination-Free Pipeline](https://img.shields.io/badge/Hallucination--Free-Pipeline-7C3AED)](#confidentiality-and-verifiable-provenance)

Source files, the SQLite database, and PDF exports never leave the user's machine. Every
surfaced value traces to a specific extractor (PDF metadata, EXIF, filesystem) or to manual
reviewer entry — so a defending attorney can demonstrate why each value sits in the bundle.

> This tool organizes evidence. It does not determine legal sufficiency. Always consult a
> qualified trademark attorney.

## What MarkProof Does

MarkProof helps organize trademark use evidence for a single local desktop user. It lets the
user create trademark cases, define concrete goods and services below Nice-class level, import
PDF and image evidence, review extracted metadata, map evidence to goods/services descriptions,
visualize coverage over time, and export a structured PDF proof bundle.

The app is a portfolio showcase for secure Electron architecture, strict TypeScript, local-first
data handling, deterministic parsing, and polished legal-tech product thinking. It is not a
production legal product.

## Why Proof Of Use Matters

Trademark proof of use is about showing genuine use of a registered mark for the goods and
services covered by the registration. In practice, attorneys and legal operations teams need to
find evidence that connects dates, territories, products or services, and source documents.

The important product detail is that evidence should not only be mapped to broad Nice classes.
It should be mapped to the actual goods/services descriptions, because a mark can be used for
some listed goods or services and not others. MarkProof models that distinction directly.

## Legal Context

MarkProof is designed around the organizational needs created by:

- **§ 26 MarkenG**: requirements for genuine use (ernsthafte Benutzung) of a registered
  German trademark.
- **Art. 18 EUTMR**: genuine-use requirement for EU trade marks (Verordnung (EU) 2017/1001).
- Related procedural contexts such as opposition proof-of-use requests
  (§ 43 Abs. 1 MarkenG, Art. 47(2) EUTMR), cancellation or revocation for non-use
  (§ 49 Abs. 1 MarkenG, Art. 58(1)(a) EUTMR), and infringement defenses where proof of use
  may be requested (§ 25 MarkenG, Art. 127(3) EUTMR).

The app deliberately avoids legal conclusions. It uses wording such as **coverage detected**,
**gap detected**, and **review recommended**. It does not say that evidence is sufficient, valid,
or outcome-determinative.

## Confidentiality And Verifiable Provenance

Two properties the architecture provides by construction:

**Confidentiality.** Source files, evidence database, and exported PDF bundles stay on the
user's machine. There is no telemetry, no cloud sync, and no remote inference. The
Mandatsgeheimnis under § 43a Abs. 2 BRAO and the security-of-processing duties under Art. 32
GDPR that attach whenever client evidence crosses an organizational boundary are minimized by
construction here.

**Verifiable provenance.** Each evidence record carries an explicit `hash_algo` field plus a
SHA-256 hash, and each candidate date is logged with its source (PDF metadata, EXIF date/time
tags including `DateTimeOriginal`, filesystem creation/modification timestamps, or manual
review) in `evidence_date_candidates`. A reviewer can trace any value back to why it was
attributed, and an attorney can defend that attribution against opposing counsel.

## Core Features

- Trademark case CRUD with mark name, owner, registration number, jurisdiction, relevant use
  period, Nice classes, and concrete goods/services descriptions.
- Evidence import for PDFs, JPEGs, and PNGs.
- SHA-256 hashing of original evidence files.
- Content-addressed local storage under the Electron user-data directory.
- PDF text extraction via `pdf-parse`.
- Image EXIF metadata extraction via `exifr`.
- Deterministic candidate-date extraction from text, EXIF, and filesystem metadata.
- Review UI for correcting date of use, evidence type, territory, notes, and goods/services
  mappings.
- Coverage matrix by goods/services row and annual time-period column.
- D3 evidence timeline ordered chronologically and color-coded by evidence type.
- Structured PDF bundle export via `pdf-lib`.
- Local audit log for imports, updates, deletes, and bundle exports.

## Local-First Design

MarkProof stores all application data locally:

- SQLite database in Electron `userData`.
- Evidence files in a local content-addressed case folder.
- PDF exports written to a user-selected local path.
- No cloud sync.
- No remote database.
- No authentication.
- No web server backend.
- No runtime registry API integration.
- No telemetry.

This is intentional. Proof-of-use evidence can contain invoices, customer names, addresses,
product photos, catalogues, and other confidential material. A portfolio project does not need
to move that data across a network to demonstrate the core architecture.

## Tech Stack

- **Electron**: desktop shell and native dialogs.
- **electron-vite**: development and production bundling.
- **React**: renderer UI.
- **TypeScript strict mode**: typed contracts across main, preload, renderer, and shared modules.
- **Tailwind CSS**: restrained product UI styling.
- **SQLite via better-sqlite3**: local-first structured storage.
- **pdf-parse**: PDF text extraction in the main process.
- **exifr**: image and EXIF metadata extraction in the main process.
- **pdf-lib**: structured PDF bundle generation.
- **D3.js**: interactive evidence timeline.
- **Vitest**: deterministic tests for core logic and services.
- **ESLint + Prettier**: code quality and formatting.

## Architecture Overview

```text
src/
  main/       Electron main process, IPC handlers, database, storage, parsing, export
  preload/    Typed contextBridge API, no generic invoke exposed
  renderer/   React UI with no direct Node.js access
  shared/     Serializable types, constants, IPC contracts, pure logic
tests/        Vitest tests for parsing, coverage, timeline, repositories, services
resources/    App icons and packaging resources
```

Key boundaries:

- Renderer calls only explicit typed preload methods.
- Filesystem operations happen in the Electron main process.
- Database operations happen in the Electron main process.
- PDF parsing and bundle generation happen outside the renderer.
- Shared modules contain serializable types and pure calculation logic.

## Security Model

Electron is configured with secure defaults:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- No broad generic IPC method exposed to the renderer.
- No remote production URLs loaded.
- Permission requests are denied by default.
- Window navigation and new-window creation are restricted.

Evidence import is also constrained:

- Supported files: PDF, JPEG, PNG.
- Extension allow-list plus magic-byte validation.
- Hard file-size limit.
- SHA-256 hash stored with explicit `hash_algo`.
- Content-addressed file path based on hash.
- Path traversal protection when resolving stored evidence paths.

## PDF Bundle Export

The PDF bundle export includes:

- Cover page with mark name, owner, registration number, jurisdiction, and relevant use period.
- Table of contents.
- Evidence index table.
- Numbered exhibits.
- Per-exhibit metadata sheet with date of use, evidence type, territory, goods/services, notes,
  source filename, and SHA-256 hash.
- Original evidence pages or images appended where practical.

Exports are generated locally and recorded in the audit log as `bundle_exported`.

## Database Model

| Table                      | Purpose                                                                   |
| -------------------------- | ------------------------------------------------------------------------- |
| `trademark_cases`          | Case-level mark, owner, jurisdiction, registration number, use period     |
| `goods_services`           | Concrete goods/services descriptions below Nice-class level               |
| `evidence_items`           | Imported evidence metadata, SHA-256 hash, review fields                   |
| `evidence_goods_services`  | Many-to-many mapping between evidence and goods/services                  |
| `evidence_date_candidates` | Candidate dates from PDF text, EXIF, file timestamps, manual review       |
| `audit_log`                | Local audit events for import, update, delete, export, and system actions |

## Development

Install dependencies:

```bash
npm install
```

Run the desktop app in development:

```bash
npm run dev
```

Quality checks:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test
```

Build:

```bash
npm run build
```

Package:

```bash
npm run dist
```

If `better-sqlite3` was rebuilt for Electron packaging and Vitest later fails against the local
Node runtime, rebuild native dependencies for Node:

```bash
npm run rebuild:node
```

## Screenshots

Screenshots and GIFs should be added to `assets/screenshots/` before publishing the portfolio:

- `assets/screenshots/case-dashboard.png`
- `assets/screenshots/evidence-review.png`
- `assets/screenshots/coverage-matrix.png`
- `assets/screenshots/timeline.gif`
- `assets/screenshots/pdf-export.png`

## Explicit Non-Goals

MarkProof intentionally does not implement:

- LLM-based extraction (would introduce model-version drift; the same source must yield the same value across years).
- Cloud sync.
- Multi-user collaboration.
- Registry API integration.
- Legal scoring.
- Legal predictions.
- Authentication.
- Payment or licensing flows.
- Remote database.
- Web server backend.

## Position Next To AI Legal Tools

MarkProof is positioned as the deterministic ground-truth layer beneath any AI-augmented IP
workflow, not as their replacement. AI legal tools — for goods/services similarity, anomaly
detection across evidence sets, or attorney-facing summarization — are only as defensible as
the evidence layer they read from. A bundle whose dates, hashes, and source attributions a
reviewer can fully reconstruct is exactly the input profile a responsibly built AI tool needs
upstream of it. Source files stay local, provenance stays explicit, and the AI tier — when
added — plugs in above this layer rather than into it.

## License And Attribution

Original source code is released under the MIT License. See [LICENSE](LICENSE).

Third-party dependencies retain their own licenses. See
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
