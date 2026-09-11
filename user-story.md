# User Story: Automated README Sync from OpenAPI

## Title
Automated Documentation Sync for API Reference

## User Story
As a repository maintainer, I want the README "API Reference" section to be automatically generated from `openapi.yaml` so that documentation stays accurate and developers don't manually update endpoint lists.

## Acceptance Criteria
1. A CLI command updates `README.md` based on `openapi.yaml`.
2. The tool updates content only between markers:
   - `<!-- API_REFERENCE_START -->`
   - `<!-- API_REFERENCE_END -->`
3. Generated content is a Markdown table with columns: Method, Path, Summary.
4. Output is deterministic and idempotent (running twice produces no further changes).
5. If `openapi.yaml` is missing, the tool exits non-zero with a clear error.
6. If `openapi.yaml` is invalid YAML, the tool exits non-zero with a clear error.
7. If README markers are missing, the tool exits non-zero with a clear error.
8. Unit tests cover:
   - happy path update
   - already up-to-date
   - missing `openapi.yaml`
   - invalid YAML
   - missing markers

## Out of Scope
- Fetching stories from JIRA/Confluence
- Supporting multiple specs at once
- Generating full docs site (only README section)