Keep these, remove the rest of the files from git and delete them

## Editor-Specific Files
These should typically be in .gitignore:
- `.cursor/` (entire directory with rules)
- `.cursorindexingignore`
- `.claude/settings.local.json` (local Claude settings)

## Personal Instructions/Reviews
These seem like development notes that shouldn't be in the repo:
- `instructions/create-orientation-document.md`
- `reviews/mcp-optional-arguments.md`

## One-off Scripts
These appear to be temporary scripts:
- `scripts/add-repomix-to-orientation.ts`

## Documentation That May Be Temporary
These might be temporary development docs:
- `docs/mcp-inspector-testing.md`
- `docs/mcp-metadata-feature.md`
- `docs/prefilled-arguments-analysis.md`
- `docs/undefined-argument-feature.md`

## Large Documentation Directory
The `orientation/` directory contains 44 markdown files. This might be legitimate documentation, but worth reviewing if all these files belong in the repo.