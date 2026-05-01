# MarkProof

Trademark Use Evidence Manager for local proof-of-use bundle preparation.

> This tool organizes evidence. It does not determine legal sufficiency. Always consult a qualified trademark attorney.

## What MarkProof Does

MarkProof is a local desktop app for structuring trademark proof-of-use evidence bundles. It is designed as a portfolio project that demonstrates secure Electron architecture, readable TypeScript, local-first data handling, and a polished workflow for organizing evidence.

The app will help users maintain trademark cases, import evidence, review extracted metadata, visualize coverage, and export structured PDF bundles.

## Why Proof Of Use Matters

Trademark rights can become vulnerable if a mark is not genuinely used for the goods and services for which it is registered. Organized evidence helps counsel review whether use can be documented across products, services, territories, and time periods.

## Brief Legal Context

- § 26 MarkenG concerns use of German trademarks.
- Art. 18 EUTMR concerns use of European Union trademarks.

MarkProof does not evaluate legal sufficiency, make predictions, or provide legal scoring. It only organizes evidence for review.

## Local-First Rationale

Proof-of-use material can include invoices, catalogues, product photos, packaging photos, screenshots, and advertisements. These files may contain confidential business information. MarkProof is therefore designed to keep all files, metadata, parsing, SQLite storage, and PDF export on the user's machine.

## No AI By Default

The project intentionally avoids AI features. Evidence handling should be deterministic, inspectable, and easy to explain in a portfolio review. Date extraction, metadata normalization, hashing, and export behavior should remain auditable and testable.

## Tech Stack

- Electron for the desktop shell.
- electron-vite for a fast Electron and Vite development workflow.
- React and TypeScript strict mode for the renderer.
- Tailwind CSS for a compact product UI.
- SQLite via better-sqlite3 for local structured data.
- pdf-parse for PDF text extraction.
- exifr for image metadata.
- pdf-lib for PDF bundle generation.
- D3.js for evidence timeline visualization.
- Vitest for deterministic core tests.
- ESLint and Prettier for code quality.

## Architecture Overview

```text
src/
  main/       Electron main process, IPC handlers, database, storage, parsing, export
  preload/    Narrow typed bridge exposed through contextBridge
  renderer/   React UI with no direct Node.js access
  shared/     Serializable types, constants, and explicit IPC contracts
tests/        Deterministic logic tests
resources/    App icons and packaging resources
```

The renderer communicates only through explicit methods exposed by the preload bridge. It never receives a generic IPC invoke function.

## Database Model

The initial SQLite schema is migration-based and contains:

- `trademark_cases` for case-level mark, owner, jurisdiction, registration, and use period data.
- `goods_services` for actual goods/services descriptions below Nice class level.
- `evidence_items` for imported file metadata, explicit `hash_algo`, SHA-256 hash, review fields, extracted text status, and file timestamps.
- `evidence_goods_services` for mapping evidence to concrete goods/services descriptions.
- `evidence_date_candidates` for deterministic candidate dates from PDFs, EXIF, filesystem metadata, or manual review.
- `audit_log` for local import, export, edit, delete, view, and system events.

## Security Model

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- No direct Node.js APIs in the renderer.
- No broad generic IPC method exposed to the renderer.
- Filesystem, database, parsing, hashing, and PDF export work happen in the main process.
- No remote production URLs are loaded.

## Storage Strategy

Original evidence files will be stored content-addressed under Electron's user data directory:

```text
<userData>/cases/<caseId>/evidence/<sha256>.<ext>
```

The SHA-256 hash is part of the evidence record. The hash algorithm is stored explicitly as `sha256` so future algorithms can be introduced without ambiguity.

Imports are validated by extension allow-list, file size cap, and magic-byte detection so non-supported or mislabeled files are rejected before storage.

## Audit Log Strategy

The initial database schema will include an `audit_log` table for local event tracking. Planned events include import, export, edit, delete, and relevant view or preview actions.

Because MarkProof has no authentication, the audit actor is a local application actor such as `local-user` or `system`. This is a local chain-of-events record, not a verified identity system.

## Development

Install dependencies:

```bash
npm install
```

Run the app in development:

```bash
npm run dev
```

Run quality checks:

```bash
npm run lint
npm run typecheck
npm run test
npm run format:check
```

If you run packaging before tests, `electron-builder` may rebuild `better-sqlite3` for Electron. Rebuild it for the local Node runtime before running Vitest again:

```bash
npm run rebuild:node
```

Build the app:

```bash
npm run build
```

Create distributables:

```bash
npm run dist
```

## Screenshots

Screenshots and short GIFs of the working UI will be added to `assets/screenshots/` once the visual presentation is finalized. Planned coverage:

- Case dashboard: `assets/screenshots/case-dashboard.png`
- Evidence review: `assets/screenshots/evidence-review.png`
- Coverage matrix: `assets/screenshots/coverage-matrix.png`
- Timeline: `assets/screenshots/timeline.gif`
- PDF export flow: `assets/screenshots/export-flow.png`

## Current Status

Implemented:

- Electron foundation, secure preload shape, packaging config
- SQLite schema with migrations and repository-level data access
- Trademark Case CRUD through typed IPC with a React case workspace
- Evidence import with PDF text extraction, image EXIF parsing, and deterministic date candidate handling
- Evidence review UI with goods/services mapping
- Coverage matrix and evidence timeline visualizations
- PDF bundle export

Not yet implemented:

- Audit log read UI
