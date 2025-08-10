#!/bin/bash

# PR 1: Setup baseline and safety nets

echo "🔧 Setting up PR 1: Baseline + Safety Nets"

# Check if we're in the app directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: Run this script from the app directory"
  exit 1
fi

echo "📦 Installing dev dependencies for strict typing and linting..."

# Add TypeScript strict config
echo "✅ Updating tsconfig.json for strict mode..."
cat > tsconfig.strict.patch << 'EOF'
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true
  }
}
EOF

echo "📝 Creating ESLint config for Jotai state..."
cat > .eslintrc.state.json << 'EOF'
{
  "extends": ["./.eslintrc.json"],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unsafe-assignment": "error",
    "@typescript-eslint/no-unsafe-member-access": "error",
    "@typescript-eslint/no-unsafe-call": "error",
    "@typescript-eslint/no-unsafe-return": "error",
    "no-console": ["warn", { "allow": ["warn", "error"] }],
    "import/no-cycle": "error",
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/await-thenable": "error"
  },
  "overrides": [
    {
      "files": ["src/renderer/state/**/*.ts", "src/renderer/state/**/*.tsx"],
      "rules": {
        "@typescript-eslint/no-explicit-any": "error"
      }
    }
  ]
}
EOF

echo "📜 Updating package.json scripts..."
cat > package.json.scripts.patch << 'EOF'
  "typecheck": "tsc --noEmit",
  "typecheck:watch": "tsc --noEmit --watch",
  "lint:state": "eslint 'src/renderer/state/**/*.{ts,tsx}' --config .eslintrc.state.json",
  "test:state": "vitest run --dir src/renderer/state",
  "test:state:watch": "vitest watch --dir src/renderer/state",
  "test:state:coverage": "vitest run --dir src/renderer/state --coverage",
  "check:all": "pnpm typecheck && pnpm lint:state && pnpm test:state"
EOF

echo "🏷️ Creating git tag for baseline..."
git tag -a "v0-clean-snapshot" -m "Baseline before Jotai refactoring" 2>/dev/null || echo "Tag already exists"

echo "📚 Creating initial documentation..."
mkdir -p src/renderer/state/core
mkdir -p src/renderer/state/lib
mkdir -p src/renderer/state/features

echo "🧪 Creating sample test for pure functions..."
cat > src/renderer/state/lib/__tests__/skipNav.test.ts << 'EOF'
import { describe, it, expect } from 'vitest';
import { advanceIndexSkipping } from '../skipNav';

describe('skipNav', () => {
  describe('advanceIndexSkipping', () => {
    it('should skip forward over skipped items', () => {
      const choices = [
        { item: { id: '1' } },
        { item: { id: '2', skip: true } },
        { item: { id: '3' } }
      ];
      
      const result = advanceIndexSkipping(1, 1, choices);
      expect(result).toBe(2);
    });
    
    it('should wrap around at end', () => {
      const choices = [
        { item: { id: '1' } },
        { item: { id: '2' } }
      ];
      
      const result = advanceIndexSkipping(1, 1, choices);
      expect(result).toBe(0);
    });
    
    it('should handle all skipped', () => {
      const choices = [
        { item: { id: '1', skip: true } },
        { item: { id: '2', skip: true } }
      ];
      
      const result = advanceIndexSkipping(0, 1, choices);
      expect(result).toBe(0);
    });
  });
});
EOF

echo "✅ PR 1 Setup Complete!"
echo ""
echo "Next steps:"
echo "1. Review tsconfig.strict.patch and apply to tsconfig.json"
echo "2. Review .eslintrc.state.json"
echo "3. Add scripts from package.json.scripts.patch to package.json"
echo "4. Run: pnpm typecheck"
echo "5. Run: pnpm lint:state"
echo "6. Run: pnpm test:state"
echo ""
echo "Once all checks pass, you're ready for PR 2!"