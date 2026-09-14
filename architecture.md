# Automated README Sync Architecture

## 1. High-Level Overview

The project is a Node.js 20+ CommonJS CLI that synchronizes a README API Reference table from one OpenAPI YAML file.

The MVP command is:

```text
npm run docsync -- sync --openapi openapi.yaml --readme README.md
```

The application follows a validate-before-write pipeline:

1. Parse and validate CLI arguments.
2. Resolve paths from `process.cwd()` and read both files as UTF-8.
3. Parse YAML and validate the OpenAPI structure.
4. Extract recognized operations.
5. Normalize, escape, sort, and render table rows.
6. Validate README markers and replace only their contents.
7. Compare the candidate README with the original.
8. Atomically write the candidate only when it differs.
9. Print the exact success message after all work succeeds.

The design intentionally does not resolve `$ref` values in path-item or operation positions. The implementation performs no network access.

## 2. Components / Modules

### CLI

**Responsibility:** Define the command-line interface and process lifecycle.

- Uses CommonJS and `commander`.
- Exposes the `sync` command with required `--openapi` and `--readme` options.
- Shows usage for missing or invalid arguments.
- Converts all expected failures into exit code `1`.
- Prints only the exact success message after the operation completes successfully.
- Does not contain parsing, formatting, or file mutation logic beyond orchestration.

Suggested module: `src/cli.js`

### File I/O

**Responsibility:** Read input files and provide file metadata needed for safe processing.

- Resolves relative paths from `process.cwd()`.
- Reads each input as a `Buffer` and decodes it with `new TextDecoder('utf-8', { fatal: true })`; malformed UTF-8 is rejected rather than replaced.
- Rejects missing, unreadable, or directory paths.
- Detects the README line-ending style from its first newline sequence: CRLF for `\r\n`, LF otherwise, and LF when the file has no newline.
- Retains the original README bytes for comparison and byte-for-byte preservation checks outside the marker interior.
- Performs atomic writes using an unpredictable, exclusively created temporary file in the README directory.

Suggested module: `src/files.js`

### YAML Parse / Validate

**Responsibility:** Convert YAML to a JavaScript value and validate required structure.

- Uses `YAML.parseDocument(text, { uniqueKeys: true })` from the `yaml` package.
- Treats entries in `document.errors`, including duplicate mapping keys, as failures; entries in `document.warnings` do not fail execution.
- Converts the document with `document.toJS({ maxAliasCount: 100 })` and accepts anchors and aliases only when conversion and structural validation succeed within that bound.
- Requires a non-null, non-array root object.
- Requires a string `openapi` value beginning with `3.`.
- Requires `paths` to be a non-null, non-array object.
- Requires every path key to begin with `/`.
- Rejects path-item `$ref` values and `$ref` properties.
- Rejects non-object path items.
- Does not validate unrelated OpenAPI fields that are outside the synchronization contract.

Suggested module: `src/openapi.js` (parse, validate, and extract operations)

### Extract Operations

**Responsibility:** Traverse validated path items and produce endpoint records.

Only these lowercase keys are operations:

- `get`
- `post`
- `put`
- `patch`
- `delete`
- `options`
- `head`
- `trace`

Path-item metadata, unknown keys, and uppercase method keys are ignored. Recognized operation values must be non-null, non-array objects. Operation `$ref` values and operation objects containing `$ref` are rejected.

Each extracted record should contain at least:

```text
{
  originalPath,
  method,
  summary
}
```

The extractor uses only the operation-level `summary`. Missing, blank, non-string, or whitespace-only summaries are represented as `-`.

Logical responsibility implemented in `src/openapi.js` for the MVP.

### Normalize / Escape

**Responsibility:** Produce safe, deterministic display values.

For paths and summaries, the normalizer shall:

1. Replace each contiguous run of spaces, tabs, carriage returns, and line feeds with one space.
2. Trim the resulting value.
3. Escape every pipe character as `\|`.

The original path remains available for deterministic tie-breaking even after display normalization.

Logical responsibility implemented in `src/markdown.js` for the MVP.

### Render Table

**Responsibility:** Convert operation records into the exact Markdown table.

The renderer always emits:

```text
| Method | Path | Summary |
| ------ | ---- | ------- |
```

It appends one row per operation and a trailing newline. With no paths or operations, it emits only the header, separator, and trailing newline.

Rows are sorted with a locale-independent UTF-16 code-unit comparator (`a < b`, `a > b`) by:

1. Normalized path, alphabetically.
2. Original path key, alphabetically.
3. Method precedence:
   - `GET=0`
   - `POST=1`
   - `PUT=2`
   - `PATCH=3`
   - `DELETE=4`
   - `HEAD=5`
   - `OPTIONS=6`
   - `TRACE=7`

The MVP extracts only these eight methods; arbitrary method keys are ignored.

Suggested module: `src/markdown.js` (normalize, sort, render, and replace marker content)

### Marker Replace

**Responsibility:** Validate and update the README marker region.

The module requires exactly one occurrence of each marker:

```text
<!-- API_REFERENCE_START -->
<!-- API_REFERENCE_END -->
```

The start marker must occur before the end marker. Missing, duplicate, or incorrectly ordered markers fail before any write occurs.

The replacement preserves both exact marker tokens and every byte outside their interior. It discards everything between the marker tokens and constructs the interior as `eol + tableUsingEol`, where the table ends with one `eol`; both markers therefore remain on separate lines. For mixed-line-ending files, outside-marker bytes remain unchanged and generated content uses the first detected line-ending style.

Logical responsibility implemented in `src/markdown.js` for the MVP.

### Atomic Writer

**Responsibility:** Safely replace the README after all validation and generation succeeds.

- Skips writing when the candidate content is identical to the original content.
- Creates an unpredictable temporary file in the README directory using exclusive `wx` creation.
- Writes and closes the complete UTF-8 candidate before renaming it over the README.
- Never deletes the destination as a rename fallback; a rename failure leaves the original in place and exits `1`.
- Best-effort removes the temporary file after write or rename failure without masking the primary error.
- Reports write or rename errors without printing a success message.
- Preserves the original README when possible and never intentionally writes partial generated content.

Logical responsibility implemented in `src/files.js` for the MVP. Pipeline orchestration lives in `src/sync.js`.

## 3. Data Flow

1. `src/cli.js` receives `sync`, `--openapi`, and `--readme`.
2. The CLI validates required option values. Missing or invalid arguments produce usage plus an error on stderr and exit `1`.
3. File I/O resolves both paths from `process.cwd()`.
4. File I/O reads both files as buffers and performs fatal UTF-8 decoding. Directory, missing, unreadable, or malformed UTF-8 inputs stop the pipeline.
5. YAML parsing uses `parseDocument` with unique-key enforcement and bounded alias conversion. Document errors and duplicate keys stop the pipeline; warnings do not.
6. OpenAPI validation checks root type, supported version prefix, `paths`, path keys, path-item objects, operation objects, and unsupported `$ref` usage.
7. Operation extraction ignores metadata and unknown keys, then creates records for recognized lowercase HTTP methods.
8. Normalization prepares path and summary display values and escapes Markdown pipes.
9. Table rendering applies the locale-independent comparator and creates the exact table with a trailing line ending.
10. README processing detects LF or CRLF, validates marker count and order, and constructs the marker interior exactly as `eol + tableUsingEol`.
11. The CLI compares the candidate README with the original.
12. If they are identical, no write occurs and the CLI prints `README already up-to-date.`.
13. If they differ, the atomic writer replaces the README.
14. Only after the atomic write succeeds does the CLI print `README updated.`.

## 4. Error-Handling Strategy

### Exit Codes

- `0`: Synchronization succeeded, whether the README changed or was already current.
- `1`: Usage error, missing or invalid file, directory input, UTF-8 decoding failure, YAML parse failure, duplicate key, validation failure, marker failure, write failure, or rename failure.

### Output Streams

- Success messages go to stdout and must be exact:
  - `README updated.`
  - `README already up-to-date.`
- All errors go to stderr.
- Usage/help may be printed to stdout for help, but missing or invalid arguments must also produce an error line on stderr.
- An error execution must not print either success message.
- Error messages should identify the failing input or rule without dumping complete file contents or secrets.

### Validate Before Mutation

All parsing, validation, marker checks, normalization, rendering, and candidate construction occur before the README is mutated. The original README remains unchanged if any pre-write step fails.

Write failures use the temporary-file-and-rename sequence. The implementation reports an actionable error and attempts to preserve the original README. A success message is emitted only after replacement succeeds.

### Error Contract

Expected usage, input, validation, marker, and filesystem failures use an `AppError` carrying a stable code and an actionable public message. The CLI prints that message to stderr without a stack trace. Unexpected exceptions produce a generic stderr message and exit `1`; neither path emits success messages or file contents.

## 5. Testing Strategy

### Unit Tests

Unit tests use Jest with CommonJS modules and focus on pure functions and narrow boundaries:

- CLI argument validation and command configuration.
- YAML parsing, duplicate-key rejection, and root validation.
- Strict UTF-8 rejection for malformed OpenAPI and README byte sequences.
- Parser warnings remaining non-fatal and bounded alias conversion failures remaining actionable.
- Supported `3.` version handling.
- Missing, invalid, and empty `paths`.
- Invalid path keys and non-object path items.
- Path-item `$ref` values and objects containing `$ref`.
- Recognized lowercase methods, ignored metadata, unknown keys, and uppercase keys.
- Invalid operation values and operation `$ref` usage, including errors containing method and path.
- Summary fallback to `-` and operation-only summary selection.
- Whitespace normalization and pipe escaping.
- Exact method and path sorting, including deterministic tie-breakers.
- Locale-independent ordering under different process locales.
- Exact table header, separator, rows, empty output, and trailing newline.
- Marker count/order validation and replacement boundaries.
- LF and CRLF candidate generation.
- No-newline README fallback to LF and mixed-line-ending behavior using the first newline style.
- Exact marker interior construction with one line ending after the start marker and the table's trailing line ending before the end marker.
- Candidate equality and unchanged-file decisions.
- Atomic writer success plus exclusive-create, write, close, and rename failures, including temporary-file cleanup and original-file preservation where the platform permits reliable simulation.
- UTF-8 BOM, non-ASCII content, and byte-for-byte preservation outside the marker interior.

### Integration Tests

Integration tests invoke the real CLI using temporary fixture files and a child process, preferably:

```text
node src/cli.js sync --openapi <temp>/openapi.yaml --readme <temp>/README.md
```

They verify:

- Happy-path README generation and exact stdout.
- A second run returns `0`, prints `README already up-to-date.`, and does not rewrite the file.
- Missing OpenAPI or README files return `1` with actionable stderr.
- Directory paths return `1` with actionable stderr.
- Malformed UTF-8 in either input returns `1` without changing the README.
- Invalid YAML and duplicate mapping keys return `1` without changing the README.
- Scalar, null, and array YAML roots return `1` without partial output.
- Unsupported versions, missing fields, invalid path keys, invalid path items, and invalid operations return `1`.
- Path-item and operation `$ref` values and object properties are rejected.
- Missing, duplicated, and incorrectly ordered markers return `1`.
- CRLF README fixtures remain CRLF after successful synchronization.
- Content before and after the markers remains byte-for-byte unchanged.
- No-newline and mixed-line-ending fixtures use the documented deterministic fallback and preserve outside-marker bytes.
- An unwritable README or README directory returns `1`, preserves the original README when possible, and does not emit a success message.
- Every failure case has empty success output on stdout.

Fixtures should remain small and focused, with separate OpenAPI and README files for happy paths, missing fields, malformed input, marker failures, CRLF behavior, and write failures.

## 6. Key Design Decisions and Tradeoffs

### CommonJS

CommonJS matches the project constraint and keeps the CLI directly runnable by Node.js 20+ without module-mode configuration. The tradeoff is that the project does not use native ESM syntax, but consistency between source and Jest is more valuable for this MVP.

### Narrow OpenAPI Scope

The implementation validates only the OpenAPI fields needed to generate the table and supports versions whose value begins with `3.`. This avoids implementing a complete OpenAPI validator while still rejecting malformed structures that could produce incorrect documentation.

### No `$ref` Resolution

Rejecting `$ref` in path-item and operation positions keeps output predictable and avoids network, filesystem, and reference-cycle concerns. A future resolver can be added behind the validation/extraction boundary without changing table rendering.

### Pure Transformation Stages

Parsing, validation, extraction, formatting, rendering, and marker replacement are separate stages. This makes deterministic behavior easy to test and keeps filesystem mutation isolated to the atomic writer. The tradeoff is a small amount of data passing between modules, which is preferable to mixing validation and mutation.

For the MVP, these are logical boundaries implemented in five physical modules: `src/cli.js`, `src/sync.js`, `src/openapi.js`, `src/markdown.js`, and `src/files.js`. This avoids unnecessary file-level fragmentation while retaining unit-testable functions.

### Preserve Existing Line Endings

The first README newline selects LF or CRLF for generated content; files without a newline default to LF. Mixed line endings outside the marker interior remain byte-for-byte unchanged. This avoids platform-specific formatting churn and supports clean, idempotent commits.

### Atomic Replacement

An unpredictable same-directory temporary file created with `wx`, fully written and closed before rename, prevents the README from being intentionally left half-written. The destination is never deleted as a fallback. The tradeoff is temporary-file management and platform-specific rename behavior, both isolated in the writer and covered by integration tests where reliable. Preservation of permissions and other filesystem metadata is out of scope for the MVP.

### Exact Output and Idempotence

The table format and success messages are fixed. Exact formatting makes output easy to compare in CI, while comparing the candidate with the original avoids unnecessary writes and ensures repeated runs are stable.

## 7. Future Extensibility

Possible future extensions include:

- A packaged `docsync` binary in addition to the npm script.
- Configurable marker names or output sections.
- Support for additional HTTP methods with an explicit precedence configuration.
- OpenAPI 3.1-specific validation.
- Safe local `$ref` resolution with cycle detection and explicit security boundaries.
- Additional generated sections beyond the API Reference table.
- Structured machine-readable output for CI integrations.
- Performance benchmarks and configurable size/time limits for unusually large inputs.
