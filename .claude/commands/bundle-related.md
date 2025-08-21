---
description: Bundle a file with all its related files using RepoMix
argument-hint: <file-path|symbol>
allowed-tools: Bash(rg:*), Bash(fd:*), Bash(repomix:*), Grep, Glob, Read
---

# Bundle Related Files

You are given a reference: $ARGUMENTS

Your task is to intelligently find ALL files that are specifically related to this reference and create a RepoMix bundle containing them.

## Process:

1. First, determine what type of reference was provided:
   - If it's a file path, use that directly
   - If it's a symbol/component name, find the primary file(s) that define it

2. Once you have the primary file(s), systematically find all related files:

   **For test files:**
   - Find the implementation file(s) being tested
   - Find any test utilities or helpers used
   - Find mocks or fixtures referenced
   - Find any other test files testing the same functionality

   **For implementation files:**
   - Find all test files that test this file
   - Find all files that import from this file
   - Find all files this file imports from (dependencies)
   - Find related type definitions
   - Find configuration files that reference this module
   - Find documentation files mentioning this component

   **For components (React/Vue/etc):**
   - Find the component definition file
   - Find all test files for the component
   - Find style/CSS files for the component
   - Find story files (*.stories.*)
   - Find all files using/importing this component
   - Find child components used by this component
   - Find parent components that use this component
   - Find related hooks, utilities, or helpers
   - Find type definitions

   **For utilities/services:**
   - Find all files importing this utility
   - Find test files
   - Find type definitions
   - Find related utilities in the same module

3. Use intelligent search strategies:
   - Search for import statements: `import .* from ['"].*filename['"]`
   - Search for require statements: `require\(['"].*filename['"]\)`
   - Search for the symbol/class/function name across the codebase
   - Look for file naming patterns (e.g., `component.tsx`, `component.test.tsx`, `component.stories.tsx`)
   - Check for barrel exports that might re-export the module
   - Look in common test directories for related tests

4. Create the RepoMix bundle:
   - Use `repomix --include` with all the discovered file paths
   - Organize the paths logically
   - Ensure the output captures the full context needed to understand the code

5. Provide a summary of what was included and why.

Remember to be thorough but focused - include files that are directly related, not the entire codebase. The goal is to create a bundle that gives complete context for understanding and working with the specified file or component.