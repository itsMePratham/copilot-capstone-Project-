# Design Review: Automated README Sync

## Summary

The architecture is directionally sound and closely follows the requirements: it defines a validate-before-write pipeline, separates pure transformations from filesystem mutation, preserves README line endings, rejects unsupported `$ref` usage, and distinguishes unit tests from real CLI integration tests.

It is not yet fully implementation-ready. Several correctness and portability decisions remain implicit, especially strict UTF-8 decoding, deterministic string comparison, exact marker replacement layout, YAML parser configuration, and atomic replacement behavior on Windows. The proposed seven physical modules are also more granular than the MVP requires. These issues should be resolved in `architecture.md` before implementation.

## Strengths

- The processing order prevents validation failures from modifying the README.
- CLI orchestration is separated from parsing, extraction, rendering, and writing.
- The architecture preserves exact success messages and stdout/stderr rules.
- Path-item and operation `$ref` usage is explicitly rejected.
- Sorting includes the required path tie-breaker and method precedence.
- Marker count and ordering validation are included before mutation.
- CRLF preservation and unchanged-file behavior are first-class concerns.
- Atomic temporary-file replacement is isolated behind a writer boundary.
- The test strategy invokes the real CLI with temporary fixtures and covers most required failures.
- The implementation performs no network access and avoids full OpenAPI validation beyond the required subset.

## Risks & Gaps

### High

#### H-1: UTF-8 validation is not implementable as described

Passing `"utf8"` to `fs.readFile` does not reject malformed byte sequences; Node.js replaces them with the Unicode replacement character. The architecture says decoding failures stop the pipeline but does not define strict decoding.

**Impact:** Invalid input can be silently altered instead of producing the error required by ER-14.

#### H-2: Atomic replacement behavior is underspecified across operating systems

The writer says to rename a temporary file over the README, but replacement semantics and failures differ across Linux, macOS, and Windows. An implementation that deletes the README before rename would violate atomicity and could lose the original. Temporary-file creation, collision prevention, permissions, cleanup, and rename failure behavior are not locked down.

**Impact:** Partial loss, non-atomic behavior, stale temporary files, or Windows-only failures.

#### H-3: Exact marker replacement layout is ambiguous

The architecture does not define the exact interior string placed between markers. It is unclear whether the replacement begins with one line ending after the start marker, how pre-existing whitespace is removed, and how the required trailing line ending is placed before the end marker.

**Impact:** Different valid-looking implementations can produce different output, break idempotence, or join a marker and table on one line.

#### H-4: Deterministic alphabetical comparison is not defined

Using `localeCompare()` without a fixed locale/options can vary by runtime locale and platform. The architecture says “alphabetically” but does not specify a comparator for normalized and original paths.

**Impact:** Different table ordering across developer machines and CI, violating deterministic generation.

### Medium

#### M-1: YAML parser configuration is not explicit

The architecture names the `yaml` package but does not specify `parseDocument`, duplicate-key enforcement, error inspection, warning handling, or alias limits. A convenience parser may not expose warnings/errors in the way needed by the requirements.

**Impact:** Duplicate keys may be handled inconsistently, parser warnings may accidentally fail execution, or aliases may consume excessive resources.

#### M-2: Line-ending detection has undefined fallback behavior

LF and CRLF are supported, but files with no newline or mixed line endings are not addressed. Using the host OS default would make output non-deterministic.

**Impact:** Cross-platform output drift and unclear CRLF behavior.

#### M-3: Temporary-file security and cleanup responsibilities are incomplete

The writer does not require exclusive creation or an unpredictable same-directory name. A predictable temporary path could be replaced or pre-created, and cleanup failures have no stated handling.

**Impact:** File clobbering or symlink-related risk in shared directories; leftover files after failed writes.

#### M-4: Error ownership and error shape are not defined

The CLI is expected to map all expected failures to exit code `1`, but modules have no agreed error contract. Without typed/coded operational errors, messages may be duplicated, stack traces may leak, or programmer defects may be mistaken for expected validation errors.

**Impact:** Inconsistent stderr, accidental sensitive diagnostics, and brittle integration tests.

#### M-5: The test strategy misses explicit strict-decoding and atomic-rename cases

The requirements call for invalid UTF-8 failures. The architecture mentions decoding failures in integration flow but does not list invalid UTF-8 fixtures. It also does not explicitly test rename failure, exclusive temporary-file creation, cleanup, or preservation of the original after rename failure.

**Impact:** Critical reliability behavior can regress without detection.

#### M-6: Byte-for-byte preservation needs byte-level assertions

The architecture says content outside markers remains byte-for-byte unchanged, while the design otherwise operates on JavaScript strings. The test method is not specified.

**Impact:** Tests may compare normalized strings and miss BOM, non-ASCII, or line-ending changes outside the marker region.

#### M-7: Requirements traceability is stale

`requirements.md` acceptance criterion AC-8 maps only ER-1 through ER-10 even though ER-11 through ER-14 were added. The architecture discusses most later errors but has no requirements-to-component/test traceability.

**Impact:** Atomic-write, no-success-on-error, directory-input, and invalid-UTF-8 requirements may be omitted during acceptance review.

### Low

#### L-1: Seven physical source modules are unnecessary for the MVP

The component boundaries are useful, but separate files for file I/O, atomic writing, normalization, rendering, extraction, and README replacement create avoidable navigation and mocking overhead for a small CLI.

**Impact:** More boilerplate and fragmented tests without proportional design value.

#### L-2: Future-method language conflicts with the fixed MVP method set

The table section discusses “any additional recognized methods,” while extraction recognizes exactly eight methods. This adds hypothetical behavior that is not reachable in the MVP.

**Impact:** Confusion about whether arbitrary HTTP method keys should be included.

#### L-3: CLI unit testing may duplicate integration coverage

Unit-testing Commander configuration is often coupled to library internals. The required behavior is better proven by child-process integration tests, while pure orchestration can be tested through an exported `runSync` function.

**Impact:** Brittle tests with little additional confidence.

#### L-4: File metadata preservation is not addressed

Replacing a file by rename may change file permissions or other metadata. The requirements do not explicitly demand metadata preservation, but executable/read-only modes may matter on POSIX systems.

**Impact:** Unexpected permission changes after a successful update.

## Recommended Changes

1. Use `fs.readFile` without an encoding and decode with `new TextDecoder('utf-8', { fatal: true })`. Strip no BOM implicitly; if a UTF-8 BOM is present, retain it in the README prefix and do not include it in YAML field names.
2. Use `YAML.parseDocument(text, { uniqueKeys: true, maxAliasCount: 100 })`. Fail on `document.errors`, ignore `document.warnings`, then validate `document.toJS({ maxAliasCount: 100 })`.
3. Define one locale-independent comparator using JavaScript UTF-16 code-unit order: return `-1` when `a < b`, `1` when `a > b`, otherwise `0`. Use it for normalized and original path keys.
4. Define marker replacement as `startMarker + eol + tableUsingEol + endMarker`. Everything originally between the exact marker tokens is discarded. The table already ends with one `eol`, so the end marker starts on the following line.
5. Detect the README line ending from the first newline sequence. Use CRLF when the first newline is `\r\n`; otherwise use LF. Default to LF when the file has no newline. Preserve all bytes outside the marker interior.
6. Implement atomic writing with an unpredictable temporary filename in the README directory, opened with exclusive creation (`wx`). Write and close the complete file before rename. Never unlink the destination as a fallback. On failure, attempt temporary-file cleanup, retain the original, report stderr, and exit `1`.
7. Treat preservation of filesystem metadata beyond file contents as out of scope for the MVP; document this rather than introducing platform-specific mode handling.
8. Introduce an `AppError` or equivalent operational error carrying a stable error code and actionable public message. The CLI prints only the public message for expected failures; unexpected failures receive a generic message and no stack trace unless a future debug mode is added.
9. Consolidate physical modules for the MVP while preserving logical boundaries: `cli.js`, `sync.js`, `openapi.js`, `markdown.js`, and `files.js` are sufficient.
10. Add invalid UTF-8 byte fixtures for both inputs, mixed/no-newline README tests, rename-failure and cleanup tests, exact marker-interior tests, BOM/non-ASCII preservation tests, and platform-neutral sort tests.
11. Use byte slices or encoded buffers in tests to prove that README content before the start marker and after the end marker is unchanged.
12. Update AC-8 in `requirements.md` to reference ER-1 through ER-14.

## Final Agreed Decisions

- Runtime is Node.js 20+ using CommonJS.
- `commander` owns CLI parsing; `sync` requires `--openapi` and `--readme`.
- Relative paths resolve from `process.cwd()`.
- Inputs are read as bytes and decoded with fatal UTF-8 validation.
- YAML is parsed with `yaml` document APIs, duplicate keys enabled as errors, warnings ignored, and aliases bounded.
- The accepted OpenAPI version is any string beginning with `3.`.
- Only lowercase `get`, `post`, `put`, `patch`, `delete`, `head`, `options`, and `trace` keys are operations.
- `$ref` is rejected when used as a path-item/operation value or as a property in either object.
- Missing or blank operation summaries render as `-`; path-level summaries are never used.
- Whitespace normalization collapses contiguous spaces, tabs, CR, and LF to one space, trims, then escapes `|` as `\|`.
- Path ordering uses locale-independent UTF-16 code-unit comparison, first on normalized path and then original path.
- Method precedence is GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, TRACE.
- Exactly one start marker and one end marker are required, in that order.
- Replacement interior is exactly one detected line ending, the generated table, and the table's trailing detected line ending before the end marker.
- The first README newline determines LF or CRLF; a file with no newline defaults to LF.
- Files with mixed line endings retain outside-marker bytes; generated content uses the first detected style.
- The README is not written when candidate bytes equal original bytes.
- Changed content is written to an exclusively created same-directory temporary file and renamed without deleting the destination first.
- The writer attempts cleanup after failure and preserves the original whenever replacement has not completed.
- Preservation of permissions and other filesystem metadata is out of scope for the MVP.
- Success messages are emitted only after the no-change decision or successful atomic rename.
- Expected failures exit `1`, write actionable messages to stderr, and emit no success message.
- Logical stages remain separately testable, but the MVP uses five physical source modules rather than seven.

## Any Required Updates to architecture.md

### Edit 1: Replace the File I/O decoding statement

```diff
-- Reads OpenAPI and README files as UTF-8.
+- Reads each input as a `Buffer` and decodes it with `TextDecoder('utf-8', { fatal: true })`; malformed UTF-8 is rejected rather than replaced.
+- Retains the original README bytes so tests and comparison can prove byte-for-byte preservation outside the marker interior.
```

### Edit 2: Expand YAML Parse / Validate

```diff
-- Uses the `yaml` package.
-- Treats YAML syntax errors and duplicate mapping keys as failures.
-- Accepts anchors and aliases when the resulting value passes validation.
+- Uses `YAML.parseDocument(text, { uniqueKeys: true, maxAliasCount: 100 })`.
+- Treats entries in `document.errors`, including duplicate mapping keys, as failures; `document.warnings` do not fail execution.
+- Converts the document with `document.toJS({ maxAliasCount: 100 })` and accepts anchors and aliases only when conversion and structural validation succeed within the alias limit.
```

### Edit 3: Lock deterministic comparison in Render Table

```diff
-Rows are sorted by:
+Rows are sorted with a locale-independent UTF-16 code-unit comparator (`a < b`, `a > b`) by:

 1. Normalized path, alphabetically.
 2. Original path key, alphabetically.
 3. Method precedence:
@@
-Any additional recognized methods, if supported by a later extension, are ordered alphabetically after these methods. In the MVP, only the eight recognized lowercase method keys are extracted.
+The MVP extracts only these eight methods; arbitrary method keys are ignored.
```

### Edit 4: Make marker replacement exact

```diff
-The replacement preserves both markers and all content outside them. It removes all existing content between the markers and inserts only the generated table. The generated content uses the README's detected line-ending style.
+The replacement preserves both exact marker tokens and every byte outside their interior. It discards everything between the marker tokens and constructs the interior as `eol + tableUsingEol`, where the table ends with one `eol`; therefore both markers remain on separate lines. The first newline sequence in the README selects CRLF or LF, and a README with no newline defaults to LF. For mixed-line-ending files, outside-marker bytes remain unchanged and generated content uses the first detected style.
```

### Edit 5: Replace Atomic Writer details

```diff
-- Creates a temporary UTF-8 file in the README's directory.
-- Writes the complete candidate content to the temporary file.
-- Renames the temporary file over the README only after the write succeeds.
-- Attempts to remove a temporary file if an error occurs before replacement.
+- Creates an unpredictable temporary file in the README directory using exclusive `wx` creation.
+- Writes and closes the complete UTF-8 candidate, then renames it over the README.
+- Never deletes the destination as a rename fallback; a rename failure leaves the original in place and exits `1`.
+- Best-effort removes the temporary file after write or rename failure without masking the primary error.
```

### Edit 6: Add an error contract under Error-Handling Strategy

```diff
+### Error Contract
+
+Expected usage, input, validation, marker, and filesystem failures use an `AppError` carrying a stable code and an actionable public message. The CLI prints that message to stderr without a stack trace. Unexpected exceptions produce a generic stderr message and exit `1`; neither path emits a success message or file contents.
```

### Edit 7: Add missing test scenarios

```diff
+- Reject malformed UTF-8 byte sequences independently in the OpenAPI and README inputs.
+- Verify duplicate-key rejection through `document.errors` while parser warnings remain non-fatal.
+- Verify alias-limit failures are actionable and do not modify the README.
+- Verify no-newline README input defaults generated content to LF.
+- Verify mixed line endings preserve outside-marker bytes and use the first newline style for generated content.
+- Verify the exact marker interior contains one line ending after the start marker and one trailing line ending before the end marker.
+- Verify deterministic ordering under different process locales.
+- Simulate temporary-file creation, write, close, and rename failures; assert cleanup, exit `1`, no success stdout, and original README preservation.
+- Verify UTF-8 BOM, non-ASCII text, and all bytes outside the marker interior remain unchanged.
```

### Edit 8: Reduce MVP physical module count

```diff
-Suggested module: `src/file-io.js`
+Suggested module: `src/files.js` (reading, strict decoding, line-ending detection, and atomic writing).

-Suggested module: `src/operations.js`
-Suggested module: `src/format.js`
-Suggested module: `src/table.js`
+Suggested modules: `src/openapi.js` (parse, validate, extract) and `src/markdown.js` (normalize, sort, render, and marker replacement).

-Suggested module: `src/readme.js`
-Suggested module: `src/atomic-write.js`
+The orchestration function lives in `src/sync.js`; these remain logical responsibilities rather than separate MVP files.
```

### Edit 9: Correct requirements traceability

```diff
-- **AC-8 (FR-21, ER-1 through ER-10):**
+- **AC-8 (FR-21 through FR-23, ER-1 through ER-14):**
```
