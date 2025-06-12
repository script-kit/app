# Suspect Files in SDK Repository

Based on review of recent commits (past week) and current file structure, the following files appear to be out of place in the SDK repository:

## Editor-Specific Files
These should typically be in .gitignore:
- `.cursor/` (entire directory with rules)
- `.cursorindexingignore`
- `.claude/settings.local.json` (local Claude settings)

## History/Documentation Tracking
These appear to be personal tracking files:
- `.specstory/` (entire directory)
  - `.specstory/.what-is-this.md`
  - `.specstory/history/2025-06-11_00-09-clarification-on-testing-mcp-tool-usage.md`
  - `.specstory/history/2025-06-11_00-13-run-the-testing-mcp-tool-usage.md`

## Personal Instructions/Reviews
These seem like development notes that shouldn't be in the repo:
- `instructions/create-orientation-document.md`
- `reviews/mcp-optional-arguments.md`

## One-off Scripts
These appear to be temporary scripts:
- `scripts/add-repomix-to-orientation.ts`
- `build/add-repomix-to-orientation.js`

## Documentation That May Be Temporary
These might be temporary development docs:
- `docs/mcp-inspector-testing.md`
- `docs/mcp-metadata-feature.md`
- `docs/prefilled-arguments-analysis.md`
- `docs/undefined-argument-feature.md`

## Test Files in Wrong Location
- `examples/test-undefined-args.js` (should probably be in test-scripts or test directories)
- `test-mcp-client.js` (previously in root, now removed)

## Files That Belonged in User Home Directory
These files were previously tracked in the repo but should have been in `~/.kit/`:
- `~/.kit/run/mcp-server.js`
- `~/.kit/run/script-runner-mcp.js`

## Large Documentation Directory
The `orientation/` directory contains 44 markdown files. This might be legitimate documentation, but worth reviewing if all these files belong in the repo.

## Recommendations
1. Add `.cursor/`, `.cursorindexingignore`, and `.specstory/` to .gitignore
2. Move or remove `instructions/` and `reviews/` directories
3. Remove one-off scripts from `scripts/` and `build/`
4. Review if all documentation in `docs/` is meant to be permanent
5. Consider moving test files to appropriate test directories