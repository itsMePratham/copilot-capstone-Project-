# Automated README Sync Requirements

## Overview

`docsync` is a Node.js 20+ CommonJS CLI that generates the README API Reference table from a single OpenAPI YAML document. It replaces only the content between the required README markers and leaves the rest of the README unchanged.

The MVP is invoked through npm:

```text
npm run docsync -- sync --openapi openapi.yaml --readme README.md
```

## Goals

- Keep the README API Reference synchronized with `openapi.yaml`.
- Produce deterministic, idempotent Markdown output.
- Fail early with actionable errors for invalid input or repository configuration.
- Keep the implementation small, testable, and portable across Linux, macOS, and Windows.

## Non-Goals / Out of Scope

- Fetching stories or specifications from JIRA, Confluence, or other services.
- Supporting multiple OpenAPI specifications in one invocation.
- Supporting Swagger/OpenAPI 2.0.
- Generating a complete documentation site.
- Adding a globally installed `docsync` binary in the MVP.
- Resolving `$ref` values in path-item or operation positions.

## Personas / Users

- **Repository maintainer:** Runs the CLI to update the checked-in README after changing the OpenAPI specification.
- **Developer or CI job:** Runs the same command and relies on deterministic output and exit codes to detect documentation drift or invalid inputs.

## Assumptions

- Node.js 20 or newer and npm are available.
- The project uses CommonJS (`require`) and does not declare `"type": "module"`.
- Input and output files are UTF-8 text files.
- Relative file paths are resolved from `process.cwd()`.
- The project uses `commander` for CLI argument handling and `yaml` for YAML parsing.
- Jest is used for automated tests and CommonJS-compatible Jest configuration.
- The YAML parser may accept anchors and aliases; they are valid when the parsed result passes all structural validation.
- Parser warnings are not errors. YAML parse errors, duplicate mapping keys, and validation failures are errors.

## Functional Requirements

- **FR-1:** The project shall provide an npm script that invokes the CLI with `npm run docsync -- ...`.
- **FR-2:** The CLI shall support the `sync` command with required `--openapi <path>` and `--readme <path>` options.
- **FR-3:** The CLI shall resolve relative input paths from `process.cwd()`, read each file as a `Buffer`, and decode it using `new TextDecoder('utf-8', { fatal: true })` so malformed UTF-8 is rejected rather than replaced.
- **FR-4:** The CLI shall parse the OpenAPI input as YAML. The parsed YAML root shall be a non-null object and shall not be an array. The root object's `openapi` value shall be a string beginning with `3.`. Versions such as `3.0`, `3.0.0`, `3.0.10`, and `3.1.0` are accepted.
- **FR-5:** The CLI shall reject missing or non-string `openapi` values and version strings that do not begin with `3.`.
- **FR-6:** The CLI shall require `paths` to be a non-null object that is not an array. An empty `paths` object is valid.
- **FR-7:** Every path key in `paths` shall be a string beginning with `/`; any other path key shall fail validation.
- **FR-8:** Each path item shall be a non-null object that is not an array. A `$ref` used as a path-item value, or a `$ref` property contained in a path-item object, is unsupported and shall fail validation because reference resolution is unsupported in path-item positions.
- **FR-9:** Only these lowercase keys shall be treated as operations: `get`, `post`, `put`, `patch`, `delete`, `options`, `head`, and `trace`. Path-item metadata such as `parameters`, `summary`, `description`, and `servers`, plus all other non-method keys and uppercase method keys, shall be ignored.
- **FR-10:** Each recognized operation value shall be a non-null object that is not an array. A `$ref` used as an operation value, or a `$ref` property contained in an operation object, is unsupported and shall fail validation because reference resolution is unsupported in operation positions. Invalid operation errors shall include both the method and path.
- **FR-11:** For each operation, the generator shall use only `operation.summary`. Missing, blank, non-string, or whitespace-only summaries shall be rendered as `-`; path-level summaries shall never be used.
- **FR-12:** The generator shall normalize path and summary values by replacing each contiguous run of spaces, tabs, carriage returns, and line feeds with a single space, trimming the result, and escaping every `|` as `\|` for Markdown table safety.
- **FR-13:** The generator shall include one row for every recognized operation, including uncommon recognized methods when present.
- **FR-14:** The generator shall use a locale-independent UTF-16 code-unit comparator (`a < b`, `a > b`) to sort rows by normalized path, then by the original path key, then by method precedence. Method precedence shall be `GET=0`, `POST=1`, `PUT=2`, `PATCH=3`, `DELETE=4`, `HEAD=5`, `OPTIONS=6`, and `TRACE=7`; any other recognized methods shall be ordered with the same comparator after these methods.
- **FR-15:** The generated table shall use exactly this header and separator:

  ```text
  | Method | Path | Summary |
  | ------ | ---- | ------- |
  ```

  It shall contain one row per operation and a trailing newline after the final table row. For empty `paths`, it shall contain only the header, separator, and required trailing newline.
- **FR-16:** The CLI shall require exactly one occurrence of `<!-- API_REFERENCE_START -->` and exactly one occurrence of `<!-- API_REFERENCE_END -->`, with the start marker before the end marker.
- **FR-17:** The CLI shall discard all existing content between the exact marker tokens and construct the replacement interior as `eol + tableUsingEol`, where the table ends with one `eol`. The markers shall remain unchanged and on separate lines, and content outside the marker pair shall remain byte-for-byte unchanged.
- **FR-18:** The CLI shall preserve the README's existing line-ending style, LF or CRLF, when writing the updated file.
- **FR-19:** The CLI shall write the README only when the generated result differs from the existing content. It shall print exactly `README updated.` when the file changes and exactly `README already up-to-date.` when no change is needed.
- **FR-20:** The CLI shall return exit code `0` after a successful update or when the README is already current.
- **FR-21:** The CLI shall use exit code `1` for usage errors, file errors, YAML parse errors, duplicate mapping keys, validation errors, or marker errors.
- **FR-22:** The CLI shall write updates atomically by writing a temporary UTF-8 file in the README directory and renaming it over the README only after the full content is written.
- **FR-23:** The CLI shall print a success message only after parsing, validation, marker validation, generation, and the atomic write have all succeeded.

## Non-Functional Requirements

- **NFR-1 (Performance):** For ordinary repository-sized OpenAPI and README files, synchronization shall complete in a single CLI process without network access; implementation shall parse and process each input once where practical.
- **NFR-2 (Reliability):** Re-running the command without changing either input shall produce no further file changes and shall return exit code `0`.
- **NFR-3 (Portability):** The CLI and tests shall run on Linux, macOS, and Windows with Node.js 20+.
- **NFR-4 (Maintainability):** Parsing, validation, row generation, Markdown formatting, marker replacement, and CLI orchestration shall be separable into unit-testable functions.
- **NFR-5 (Usability):** Successful output shall clearly distinguish an updated README from an already up-to-date README using the exact required messages.
- **NFR-6 (Usability):** Missing or invalid CLI arguments shall display usage/help and an error line; the error shall be written to stderr and the process shall exit with code `1`.
- **NFR-7 (Security):** Errors shall be descriptive and actionable without printing file contents unnecessarily or leaking secrets. The tool shall not require network access or credentials.
- **NFR-8 (Consistency):** Generated output shall be deterministic for the same input, independent of YAML property insertion order where sorting rules apply.

## Error Handling Requirements

- **ER-1:** If `--openapi` or `--readme` is missing, invalid, unreadable, not found, or points to a directory, the CLI shall write an actionable error to stderr, show usage for missing/invalid arguments, and exit `1`.
- **ER-2:** If the OpenAPI file cannot be parsed as YAML, the CLI shall write a clear parse error to stderr and exit `1`.
- **ER-3:** Duplicate YAML mapping keys shall be treated as invalid input; the CLI shall write a clear error to stderr and exit `1`.
- **ER-4:** A scalar, null, or array YAML root, or missing, non-string, or non-`3.` `openapi` value, shall produce an actionable validation error and exit `1`.
- **ER-5:** Missing, invalid, or non-object `paths` values shall produce a validation error and exit `1`.
- **ER-6:** Invalid path keys, non-object path items, and `$ref` path items shall produce validation errors and exit `1`.
- **ER-7:** Non-object recognized operations and `$ref` operations shall produce an error containing the method and path, then exit `1`.
- **ER-8:** Missing, duplicated, or incorrectly ordered README markers shall produce a clear marker error and exit `1`.
- **ER-9:** All errors shall be written to stderr. No error path shall write a partially generated README.
- **ER-10:** The CLI shall return only the documented success or failure statuses: `0` for success and `1` for all specified errors.
- **ER-11:** If writing or replacing the README fails, the CLI shall return exit code `1`, write an actionable error to stderr, and preserve the original README when possible; it shall not leave partial output.
- **ER-12:** On any error execution, the CLI shall not print either success message to stdout.
- **ER-13:** If `--openapi` or `--readme` points to a directory, the CLI shall return exit code `1` and write an actionable error to stderr.
- **ER-14:** If either input cannot be decoded as UTF-8, the CLI shall return exit code `1` and write an actionable error to stderr.

## Edge Cases

- `paths` is empty: generate only the table header and separator, followed by a newline.
- An operation has no `summary`, an empty summary, or a whitespace-only summary: render `-`.
- A summary or path contains leading/trailing whitespace, tabs, newlines, or `|`: normalize and escape it before rendering.
- Multiple methods exist for one path: apply the defined method precedence.
- Uncommon recognized methods (`head`, `options`, `trace`) are present: include and order them after the five primary methods.
- Path-item metadata and unknown keys are present: ignore them.
- Uppercase method keys are present: ignore them.
- Anchors and aliases produce valid object structures: accept them.
- The README uses CRLF: preserve CRLF throughout the updated file.
- The README has duplicate markers, an end marker before a start marker, or only one marker: fail without writing.
- A path item or operation is `null`, an array, or another non-object value: fail validation.
- A path-item value or operation value is `$ref`, or a path-item/operation object contains a `$ref` property: fail because reference resolution is unsupported in these positions.
- A valid YAML document has missing required root fields, an unsupported version, invalid path keys, or duplicate keys: fail validation.
- The generated content already matches the README: do not rewrite the file.
- A README write or replacement fails: preserve the original README when possible and do not leave partial output.
- A YAML root is scalar, null, or an array: fail validation.
- Input files are directories or cannot be decoded as UTF-8: fail with an actionable error.

## Acceptance Criteria

- **AC-1 (FR-1, FR-2):** Running `npm run docsync -- sync --openapi openapi.yaml --readme README.md` invokes synchronization with both specified files.
- **AC-2 (FR-3, FR-4, FR-5):** The CLI reads UTF-8 YAML from the current working directory context and accepts only string OpenAPI versions beginning with `3.`.
- **AC-3 (FR-6, FR-7, FR-8, FR-9, FR-10):** Valid OpenAPI structure is accepted; invalid root, path, path key, operation, and unsupported `$ref` structures fail with exit code `1`.
- **AC-4 (FR-11, FR-12, FR-13, FR-14):** Endpoint rows use only operation summaries, normalize and escape values, include recognized methods, and follow deterministic path/method ordering.
- **AC-5 (FR-15):** The generated content uses the exact required table header and separator, has one row per operation, and has a trailing newline; empty `paths` has no rows.
- **AC-6 (FR-16, FR-17, FR-18):** Exactly one correctly ordered marker pair is required; only the content between markers is replaced and the README line-ending style is preserved.
- **AC-7 (FR-19, FR-20):** Changed files produce exactly `README updated.` and exit `0`; unchanged files produce exactly `README already up-to-date.` and exit `0` without rewriting.
- **AC-8 (FR-21 through FR-23, ER-1 through ER-14):** Missing files, invalid arguments, YAML errors, duplicate keys, invalid structures, marker errors, decoding errors, directory inputs, and write failures write actionable errors to stderr and exit `1` without partial output or success messages.
- **AC-9 (NFR-1 through NFR-8):** The implementation is portable, deterministic, idempotent, maintainable, usable, secure, and does not require network access.

## Test Scenarios

### Unit Tests

- Parse a valid OpenAPI 3.x document, including `3.0`, `3.0.0`, `3.0.10`, and `3.1.0`.
- Reject a missing `openapi`, non-string `openapi`, and non-`3.` version.
- Reject scalar, null, and array YAML roots.
- Accept empty `paths` and generate only the header and separator.
- Reject missing, null, array, or scalar `paths`.
- Accept valid slash-prefixed path keys and reject malformed path keys.
- Reject non-object path items, path-item `$ref` values, and path-item objects containing `$ref`.
- Ignore metadata, unknown keys, and uppercase method keys.
- Generate rows for all eight recognized lowercase methods.
- Reject null, array, scalar, `$ref` operation values, and operation objects containing `$ref`, with an error containing both method and path.
- Use operation-level summary only; render `-` for missing and blank summaries.
- Normalize whitespace and escape pipes in paths and summaries.
- Verify alphabetical path sorting and primary-then-alphabetical method sorting.
- Verify exact table header, separator, row format, and trailing newline.
- Detect duplicate, missing, and out-of-order README markers.
- Replace only marker content and preserve content outside the markers.
- Preserve LF and CRLF line endings.
- Return unchanged content when generated output already matches.
- Verify atomic write behavior by simulating an unwritable README or README directory, asserting exit code `1`, no partial README modification, and preservation of the original file when possible.
- Verify failures do not print either success message to stdout.

### CLI Integration Tests

- Invoke the real CLI with `node src/cli.js sync --openapi <temp>/openapi.yaml --readme <temp>/README.md` and verify the generated README, stdout message, and exit code.
- Run the same CLI twice and verify the second run prints exactly `README already up-to-date.`, returns `0`, and does not modify the file.
- Verify a changed README prints exactly `README updated.` and returns `0`.
- Verify a missing OpenAPI file (Not Found) returns `1`, writes an actionable error to stderr, and leaves the README unchanged.
- Verify a missing README file (Not Found) returns `1` and writes an actionable error to stderr.
- Verify invalid YAML, duplicate keys, unsupported version, missing fields, invalid path keys, and invalid structures return `1` without partial README output.
- Verify missing, duplicated, or out-of-order markers return `1` with errors on stderr.
- Verify missing CLI arguments show usage/help and an error on stderr.
- Verify CRLF fixture files remain CRLF after synchronization.
- Verify content before and after the markers is byte-for-byte unchanged.
- Verify an unwritable README or README directory returns `1`, does not partially modify the README, and does not emit either success message to stdout.
- Verify scalar, null, and array YAML roots return `1` without partial README output.
- Verify path-item and operation `$ref` values and objects containing `$ref` return `1` without partial README output.
- Verify duplicate markers and wrong marker order return `1` without partial README output.
- Verify an already up-to-date README is not written and prints exactly `README already up-to-date.`.

## Open Questions

None. The requirements are sufficiently defined for implementation.
