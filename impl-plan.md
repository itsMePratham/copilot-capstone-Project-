# Implementation Plan: Automated README Sync

## Dependency Order

Tasks are listed in topological order. A task marked **Blocked by** must not begin until all listed tasks are complete.

## Task 1: Initialize the Node.js Toolchain

**Goal:** Establish the Node.js 20+ CommonJS project, dependencies, test runner, linting, and formatting commands.

**Blocked by:** None.

**Files to create or update:**

- `package.json`
- `package-lock.json`
- `jest.config.js`
- `eslint.config.js`
- `.prettierrc.json`
- `.prettierignore`
- `.gitignore`

**Work:**

- Set `engines.node` to `>=20` and do not add `"type": "module"`.
- Add runtime dependencies `commander` and `yaml`.
- Add development dependencies `jest`, `eslint`, and `prettier`.
- Add scripts:
  - `docsync`: `node src/cli.js`
  - `test`: `jest`
  - `test:coverage`: `jest --coverage`
  - `lint`: `eslint .`
  - `format`: `prettier --check .`
  - `format:write`: `prettier --write .`
- Configure Jest for the Node environment and CommonJS source files.
- Configure ESLint for Node.js 20 and CommonJS globals.
- Ignore dependencies, coverage output, and temporary files.

**Completion criteria:**

- `npm install` completes successfully on Node.js 20+.
- `npm test -- --runInBand --passWithNoTests`, `npm run lint`, and `npm run format` execute successfully.
- `npm run docsync -- --help` can start the CLI entry point after Task 9 without script changes.

## Task 2: Define the Application Error Contract

**Goal:** Provide one consistent error type for expected usage, input, validation, marker, and filesystem failures.

**Blocked by:** Task 1.

**Files to create or update:**

- `src/errors.js`
- `tests/errors.test.js`

**Work:**

- Implement `AppError` with a stable machine-readable `code`, an actionable public `message`, and an optional `cause` that is never printed by default.
- Define stable codes for argument, file-not-found, directory, unreadable-file, invalid-UTF8, YAML-parse, YAML-alias-limit, OpenAPI-validation, marker-validation, temporary-file, write, and rename failures.
- Keep stack traces and raw file contents out of public error formatting.

**Completion criteria:**

- Expected failures can be identified with `instanceof AppError` and a stable code.
- Public messages are actionable without including input file contents or secrets.
- Unit tests verify code, message, optional cause retention, and safe public formatting.

## Task 3: Implement Strict Input Reading and Line-Ending Detection

**Goal:** Resolve input paths, validate file types, read bytes, reject malformed UTF-8, and determine deterministic README line endings.

**Blocked by:** Tasks 1 and 2.

**Files to create or update:**

- `src/files.js`
- `tests/files.test.js`

**Work:**

- Resolve relative paths from an injected working directory that defaults to `process.cwd()`.
- Use `fs.promises.stat` or equivalent to reject directories explicitly.
- Read each file as a `Buffer`.
- Decode with `new TextDecoder('utf-8', { fatal: true })`.
- Map missing, unreadable, directory, and malformed UTF-8 failures to `AppError`.
- Detect CRLF when the first newline sequence is `\r\n`; otherwise use LF.
- Default to LF when the README contains no newline.
- Retain the original README buffer and decoded text for later byte comparison.

**Completion criteria:**

- Relative and absolute paths resolve correctly.
- Valid UTF-8, including non-ASCII text, decodes without loss.
- Malformed UTF-8 is rejected instead of receiving replacement characters.
- Missing files, directories, and read failures produce the expected error codes.
- LF, CRLF, no-newline, and mixed-line-ending inputs select the documented `eol`.

## Task 4: Parse, Validate, and Extract OpenAPI Operations

**Goal:** Convert YAML into validated operation records while enforcing the supported OpenAPI subset.

**Blocked by:** Tasks 1 and 2.

**Files to create or update:**

- `src/openapi.js`
- `tests/openapi.test.js`

**Work:**

- Parse with `YAML.parseDocument(text, { uniqueKeys: true })`.
- Fail on `document.errors`, including duplicate keys, while ignoring `document.warnings`.
- Convert with `document.toJS({ maxAliasCount: 100 })` and map alias-limit failures to `AppError`.
- Require a non-null, non-array root object.
- Require `openapi` to be a string beginning with `3.`.
- Require `paths` to be a non-null, non-array object; allow it to be empty.
- Require every path key to begin with `/`.
- Require each path item to be a non-null, non-array object.
- Reject path-item `$ref` values and objects containing a `$ref` property.
- Recognize only lowercase `get`, `post`, `put`, `patch`, `delete`, `head`, `options`, and `trace`.
- Ignore metadata, unknown keys, and uppercase method keys.
- Require recognized operations to be non-null, non-array objects.
- Reject operation `$ref` values and objects containing a `$ref` property.
- Include path and method in invalid-operation messages.
- Return records containing `originalPath`, uppercase `method`, and operation-level `summary`.

**Completion criteria:**

- Supported OpenAPI 3.x inputs produce the expected operation records.
- Empty `paths` produces an empty record list.
- Invalid roots, versions, paths, path items, operations, duplicate keys, and excessive aliases fail with actionable `AppError` values.
- `$ref` is rejected in every path-item and operation position required by the architecture.
- YAML warnings remain non-fatal.
- Operation extraction is independent of YAML property order.

## Task 5: Implement Value Normalization, Ordering, and Table Rendering

**Goal:** Produce exact, deterministic Markdown table content from operation records.

**Blocked by:** Tasks 1, 2, and 4.

**Files to create or update:**

- `src/markdown.js`
- `tests/markdown-render.test.js`

**Work:**

- Normalize path and summary values by collapsing each contiguous run of spaces, tabs, CR, and LF to one space, then trimming.
- Use `-` for missing, non-string, empty, or whitespace-only operation summaries.
- Escape every `|` as `\|` after whitespace normalization.
- Implement a locale-independent UTF-16 code-unit comparator using `<` and `>`.
- Sort by normalized path, original path key, and method precedence.
- Use precedence `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, `TRACE`.
- Render the exact header and separator required by the specification.
- Accept an `eol` argument and end every rendered table, including an empty table, with exactly one `eol`.

**Completion criteria:**

- Table output matches the exact header, separator, row, escaping, and trailing-line-ending contract.
- Empty operations render only the header, separator, and one trailing `eol`.
- Reordered input properties produce identical output.
- Sorting remains identical under different process locales.
- Unit tests cover whitespace runs, pipes, path parameters, missing summaries, tie-breakers, every method, LF, and CRLF.

## Task 6: Implement Strict README Marker Replacement

**Goal:** Validate the marker pair and construct the candidate README without changing content outside the marker interior.

**Blocked by:** Tasks 2, 3, and 5.

**Files to create or update:**

- `src/markdown.js`
- `tests/markdown-markers.test.js`

**Work:**

- Require exactly one `<!-- API_REFERENCE_START -->` and one `<!-- API_REFERENCE_END -->`.
- Reject missing, duplicate, and incorrectly ordered markers.
- Discard all existing bytes represented by decoded content between the exact marker tokens.
- Construct the replacement interior exactly as `eol + tableUsingEol`.
- Ensure the table already ends with one `eol`, placing the end marker on the following line.
- Preserve both marker tokens and all content outside their interior.
- Encode the candidate as UTF-8 for byte-level equality and preservation checks.

**Completion criteria:**

- Valid marker input produces the exact documented layout.
- Missing, duplicate, and wrong-order markers fail before any write.
- Existing whitespace and content between markers are fully removed.
- Content before the start marker and after the end marker remains byte-for-byte unchanged for LF, CRLF, mixed-line-ending, BOM, and non-ASCII fixtures.
- Running replacement against already generated content produces identical candidate bytes.

## Task 7: Implement Atomic README Writing

**Goal:** Replace changed README content without intentionally exposing partial output or deleting the destination as a fallback.

**Blocked by:** Tasks 1, 2, and 3.

**Files to create or update:**

- `src/files.js`
- `tests/atomic-write.test.js`

**Work:**

- Compare original and candidate buffers before creating a temporary file.
- Return an unchanged result without writing when buffers are equal.
- Generate an unpredictable temporary filename in the README directory.
- Open the temporary file with exclusive `wx` creation.
- Write and close the complete candidate before rename.
- Rename the temporary file over the README.
- Never unlink the destination to work around rename failure.
- Best-effort remove the temporary file after create, write, close, or rename failure without masking the primary error.
- Keep preservation of permissions and other filesystem metadata out of MVP scope.

**Completion criteria:**

- Equal candidate bytes cause no filesystem write and return `changed: false`.
- Successful replacement returns `changed: true` and leaves no temporary file.
- Exclusive-create, write, close, and rename failures return actionable `AppError` values.
- Failure paths emit no success output, preserve the original when replacement has not completed, and attempt temporary-file cleanup.
- Tests use injected filesystem functions or controlled temporary directories rather than platform-specific global permission assumptions where practical.

## Task 8: Implement Synchronization Orchestration

**Goal:** Connect reading, parsing, extraction, rendering, marker replacement, comparison, and atomic writing in the required order.

**Blocked by:** Tasks 2 through 7.

**Files to create or update:**

- `src/sync.js`
- `tests/sync.test.js`

**Work:**

- Export a `syncDocumentation` function accepting OpenAPI path, README path, and optional injected dependencies/working directory.
- Read and validate both inputs before attempting mutation.
- Parse and extract OpenAPI operations.
- Detect README line endings, render the table, and replace marker content.
- Encode and compare candidate bytes with the original.
- Call the atomic writer only when content differs.
- Return a structured result indicating `updated` or `unchanged`; do not print from this module.

**Completion criteria:**

- The orchestration order matches the architecture data flow.
- Every pre-write failure leaves the README unchanged.
- Updated and unchanged outcomes are returned distinctly.
- The atomic writer is never called for unchanged content.
- Unit tests verify dependency calls, ordering, short-circuit behavior, and error propagation.

## Task 9: Implement the CLI Command and Process Boundary

**Goal:** Expose the real `sync` command with exact output, usage, and exit behavior.

**Blocked by:** Tasks 1, 2, and 8.

**Files to create or update:**

- `src/cli.js`
- `tests/cli.test.js`

**Work:**

- Configure Commander with the `sync` command and required `--openapi <path>` and `--readme <path>` options.
- Invoke `syncDocumentation` using `process.cwd()`.
- Print exactly `README updated.` after a successful write.
- Print exactly `README already up-to-date.` after a successful no-change result.
- Print expected `AppError.message` values to stderr and set exit code `1`.
- Print a generic stderr message for unexpected exceptions without a stack trace or file contents.
- Ensure no failure path prints either success message.
- Ensure missing or invalid arguments show usage/help and an error line on stderr with exit code `1`.

**Completion criteria:**

- The documented npm command works with relative paths.
- Success exits `0` with exactly one required stdout message.
- Expected and unexpected failures exit `1`, write to stderr, and emit no success message.
- Missing command/options and missing option values display usage and fail with exit code `1`.
- `node src/cli.js sync ...` and `npm run docsync -- sync ...` behave equivalently.

## Task 10: Create Integration Fixtures and Helpers

**Goal:** Establish deterministic fixture inputs and isolated temporary-workspace helpers for real CLI tests.

**Blocked by:** Task 1.

**Files to create or update:**

- `tests/fixtures/openapi/valid.yaml`
- `tests/fixtures/openapi/empty-paths.yaml`
- `tests/fixtures/openapi/invalid.yaml`
- `tests/fixtures/openapi/duplicate-keys.yaml`
- `tests/fixtures/openapi/invalid-structure.yaml`
- `tests/fixtures/openapi/ref-path-item.yaml`
- `tests/fixtures/openapi/ref-operation.yaml`
- `tests/fixtures/readme/lf.md`
- `tests/fixtures/readme/crlf.md`
- `tests/fixtures/readme/missing-markers.md`
- `tests/fixtures/readme/duplicate-markers.md`
- `tests/fixtures/readme/wrong-order.md`
- `tests/helpers/temp-workspace.js`

**Work:**

- Keep text fixtures small and focused on one behavior.
- Create CRLF and malformed UTF-8 fixtures as buffers during test setup when repository tooling could normalize their bytes.
- Provide helpers that create and clean isolated temporary directories.
- Provide a helper to invoke `node src/cli.js` with captured stdout, stderr, and exit status.
- Support buffer-level assertions and modification-time checks.

**Completion criteria:**

- Fixture bytes are deterministic on Linux, macOS, and Windows.
- Temporary directories are removed after successful and failed tests.
- CLI helper exposes exit code, stdout, and stderr without shell-specific quoting.
- Tests can create malformed UTF-8, mixed-line-ending, no-newline, BOM, and non-ASCII cases without changing checked-in fixtures.

## Task 11: Complete Focused Unit Test Coverage

**Goal:** Verify each logical component independently before relying on end-to-end tests.

**Blocked by:** Tasks 2 through 7 and Task 10.

**Files to create or update:**

- `tests/errors.test.js`
- `tests/files.test.js`
- `tests/openapi.test.js`
- `tests/markdown-render.test.js`
- `tests/markdown-markers.test.js`
- `tests/atomic-write.test.js`
- `tests/sync.test.js`

**Work:**

- Complete all unit scenarios listed in `requirements.md` and `architecture.md`.
- Use table-driven cases for root types, versions, path items, operations, `$ref`, markers, methods, and summaries.
- Test strict UTF-8 decoding for each input type.
- Test duplicate-key errors, non-fatal parser warnings, valid aliases, and alias-limit failures.
- Test exact normalization, escaping, sorting, table bytes, marker interior, and line endings.
- Test atomic-writer cleanup and original-file preservation through injected failures.

**Completion criteria:**

- Every public pure function and expected `AppError` branch has focused coverage.
- Tests explicitly cover empty paths, uncommon methods, property-order independence, locale independence, LF, CRLF, mixed/no-newline files, and unchanged candidates.
- No unit test depends on network access, global locale, or OS-specific permission behavior.
- `npm test -- --runInBand` passes.

## Task 12: Implement Real CLI Integration Tests

**Goal:** Prove the complete command works with real files and process-level stdout, stderr, and exit codes.

**Blocked by:** Tasks 8 through 11.

**Files to create or update:**

- `tests/cli.integration.test.js`
- Files under `tests/fixtures/` as needed

**Work:**

- Invoke `node src/cli.js sync --openapi <path> --readme <path>` using `spawnSync` or an equivalent argument-array API.
- Cover happy-path update and exact generated Markdown.
- Run twice and verify the second run reports unchanged and does not alter bytes or modification time.
- Cover missing files, directory inputs, unreadable inputs where portable, malformed UTF-8, invalid YAML, duplicate keys, invalid roots, invalid versions, invalid paths, invalid operations, and `$ref` rejection.
- Cover missing, duplicate, and wrong-order markers.
- Verify CRLF preservation and deterministic no-newline/mixed-line-ending behavior.
- Verify bytes outside markers, including BOM and non-ASCII data, remain unchanged.
- Simulate atomic write/rename failure through an injectable test boundary or portable controlled failure.
- Assert every failure exits `1`, writes actionable stderr, emits no success stdout, and leaves the original README unchanged when replacement has not completed.

**Completion criteria:**

- Required happy-path, already-current, Not Found, missing-field, validation, marker, encoding, and write-failure scenarios pass.
- Both `README updated.` and `README already up-to-date.` are asserted exactly.
- Failure tests assert exit code, stderr, stdout, README bytes, and temporary-file cleanup where applicable.
- Integration tests pass on Linux, macOS, and Windows without shell-specific commands.

## Task 13: Run Quality Gates and Final Requirement Traceability

**Goal:** Confirm the implementation is complete, portable, documented, and mapped to all requirements.

**Blocked by:** Tasks 1 through 12.

**Files to create or update:**

- `README.md`
- `requirements.md` only if a traceability defect is discovered
- `architecture.md` only if implementation intentionally differs from the agreed design

**Work:**

- Add concise installation and CLI usage instructions to `README.md` without manually maintaining generated endpoint rows.
- Run tests, coverage, lint, and format checks.
- Run the CLI twice against representative LF and CRLF examples.
- Map FR-1 through FR-23, NFR-1 through NFR-8, and ER-1 through ER-14 to implementation modules and tests.
- Confirm the package contains no ESM configuration, network dependency, `$ref` resolver, or unsupported generated-doc features.
- Review error output for accidental file-content, stack-trace, or secret disclosure.

**Completion criteria:**

- `npm test -- --runInBand` passes.
- `npm run test:coverage` passes with meaningful coverage of all required branches.
- `npm run lint` and `npm run format` pass.
- Manual smoke tests for update and already-current outcomes produce exact output and exit `0`.
- Representative error smoke tests produce actionable stderr, no success stdout, exit `1`, and no README corruption.
- Every requirement has at least one owning module and one automated test or an explicit documented rationale.
