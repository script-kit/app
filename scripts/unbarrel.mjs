// scripts/unbarrel.mjs
// Usage:
//   pnpm dlx tsx scripts/unbarrel.mjs
//   pnpm dlx tsx scripts/unbarrel.mjs --dry
//   pnpm dlx tsx scripts/unbarrel.mjs --barrels src/renderer/src/state/atoms/index.ts,src/renderer/src/state/index.ts

import { Project, ts } from "ts-morph";
import path from "node:path";
import fs from "node:fs";
import prettier from "prettier";

const args = new Map(process.argv.slice(2).flatMap(a => {
  if (!a.startsWith("--")) return [];
  const [k,v="true"] = a.replace(/^--/,"").split("=");
  return [[k, v]];
}));

const DRY = args.get("dry") === "true";
const barrelArg = args.get("barrels");

const defaultBarrels = [
  "src/renderer/src/state/atoms/index.ts",
  "src/renderer/src/state/index.ts",
];
const barrelPaths = (barrelArg ? barrelArg.split(",") : defaultBarrels)
  .map(p => path.resolve(p));

const project = new Project({
  tsConfigFilePath: "tsconfig.json",
  skipAddingFilesFromTsConfig: false,
});

// Ensure all TypeScript files in src/renderer are loaded
project.addSourceFilesAtPaths("src/renderer/**/*.{ts,tsx}");

// Also add jotai.ts which is referenced by state/index.ts
const jotaiPath = path.resolve("src/renderer/src/jotai.ts");
try {
  project.addSourceFileAtPath(jotaiPath);
} catch (e) {
  console.log(`Could not add jotai.ts: ${e}`);
}

const checker = project.getTypeChecker();

// Debug: Check if source files are being found
console.log("Looking for barrel files at:");
barrelPaths.forEach(p => console.log(`  ${p}`));

const barrelSourceFiles = barrelPaths
  .map(p => {
    const sf = project.getSourceFile(p);
    if (!sf) {
      // Try adding the file explicitly
      try {
        return project.addSourceFileAtPath(p);
      } catch (e) {
        console.log(`  Could not find or add: ${p}`);
        return null;
      }
    }
    return sf;
  })
  .filter(Boolean);

const barrelFiles = new Set(
  barrelSourceFiles.map(sf => sf.getFilePath())
);

// Cheap detector to skip node_modules etc
const isCodeFile = (sf) => {
  const p = sf.getFilePath();
  return !p.includes("node_modules") && (p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".mts") || p.endsWith(".cts") || p.endsWith(".jsx") || p.endsWith(".js"));
};

const relModulePath = (fromFilePath, toFilePath) => {
  let rel = path.relative(path.dirname(fromFilePath), toFilePath).replace(/\\/g, "/");
  rel = rel.replace(/\.(ts|tsx|mts|cts|js|jsx)$/, "");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
};

function resolveAliasedSymbol(sym) {
  // Follow through re-exports to the original declaration
  let cur = sym;
  while (true) {
    const aliased = cur.getAliasedSymbol?.();
    if (!aliased || aliased === cur) return cur;
    cur = aliased;
  }
}

function upsertNamedImport(targetFile, moduleSpecifier, specs) {
  // Merge into existing import from same module if present.
  const existing = targetFile.getImportDeclarations().find(d => d.getModuleSpecifierValue() === moduleSpecifier);

  // Split imports into type-only and value so we preserve `import type`
  const typeSpecs = specs.filter(s => s.typeOnly);
  const valSpecs  = specs.filter(s => !s.typeOnly);

  const addSpecs = (decl, list) => {
    if (!list.length) return;
    if (!decl) {
      decl = targetFile.addImportDeclaration({
        moduleSpecifier,
        namedImports: [],
      });
    }
    const already = new Set(decl.getNamedImports().map(i => (i.getAliasNode()?.getText()) || i.getName()));
    for (const { name, alias } of list) {
      const local = alias || name;
      if (already.has(local)) continue;
      decl.addNamedImport(alias ? { name, alias } : { name });
    }
  };

  // Ensure separate `import type` when needed
  const existingType = targetFile.getImportDeclarations().find(
    d => d.getModuleSpecifierValue() === moduleSpecifier && d.isTypeOnly()
  );
  const existingVal  = existing && !existing.isTypeOnly() ? existing : targetFile.getImportDeclarations().find(
    d => d.getModuleSpecifierValue() === moduleSpecifier && !d.isTypeOnly()
  );

  if (valSpecs.length) {
    addSpecs(existingVal || existing, valSpecs);
    if (existingVal) existingVal.setIsTypeOnly(false);
  }
  if (typeSpecs.length) {
    const decl = existingType || targetFile.addImportDeclaration({ moduleSpecifier, namedImports: [] });
    decl.setIsTypeOnly(true);
    addSpecs(decl, typeSpecs);
  }
}

console.log(`Unbarreling ${barrelFiles.size} barrel files...`);
barrelFiles.forEach(bf => console.log(`  - ${bf}`));

let changedFiles = 0;
let filesProcessed = 0;
let importsFromBarrels = 0;

for (const sf of project.getSourceFiles()) {
  if (!isCodeFile(sf)) continue;
  filesProcessed++;

  const toRemove = [];
  const toAddPerFile = new Map(); // moduleSpecifier -> [{name, alias, typeOnly}]
  let mutated = false;

  for (const imp of sf.getImportDeclarations()) {
    const moduleSpec = imp.getModuleSpecifierValue();
    const target = imp.getModuleSpecifierSourceFile();
    
    // Log what we're seeing for debugging
    if (moduleSpec.includes("state") && filesProcessed < 5) {
      console.log(`  Import: "${moduleSpec}" -> ${target ? target.getFilePath() : "NO TARGET"}`);
    }
    
    if (!target) continue;
    const targetPath = target.getFilePath();

    // Only rewrite imports that point to one of the barrel files
    if (!barrelFiles.has(targetPath)) continue;
    
    importsFromBarrels++;
    console.log(`Found import from barrel in ${sf.getFilePath()}: ${moduleSpec}`);

    // Collect specifiers and resolve their origins
    const named = imp.getNamedImports();
    if (named.length === 0) continue; // skip default or namespace imports (rare for barrels)
    const thisImportIsTypeOnly = imp.isTypeOnly();

    const keepSpecs = []; // in case some symbols fail to resolve, we keep them

    for (const spec of named) {
      const name = spec.getName();
      const alias = spec.getAliasNode()?.getText();
      const sym = spec.getSymbol();
      if (!sym) { keepSpecs.push(spec); continue; }

      const resolved = resolveAliasedSymbol(sym);
      const decls = resolved.getDeclarations();
      if (!decls || decls.length === 0) { keepSpecs.push(spec); continue; }

      // Take first declaration as the owner
      const originFile = decls[0].getSourceFile();
      const originPath = originFile.getFilePath();

      // If we somehow still end on the barrel, skip
      if (barrelFiles.has(originPath)) { keepSpecs.push(spec); continue; }

      const mod = relModulePath(sf.getFilePath(), originPath);
      if (!toAddPerFile.has(mod)) toAddPerFile.set(mod, []);
      toAddPerFile.get(mod).push({
        name,
        alias,
        typeOnly: thisImportIsTypeOnly || spec.isTypeOnly(),
      });
      mutated = true;
      spec.remove();
    }

    // If no named imports remain, mark the whole import for removal
    if (imp.getNamedImports().length === 0 && !imp.getNamespaceImport() && !imp.getDefaultImport()) {
      toRemove.push(imp);
    }
  }

  if (mutated) {
    // Add new imports
    for (const [mod, specs] of toAddPerFile) {
      // Merge same-module duplicates and keep unique (name+alias+typeOnly)
      const uniq = [];
      const seen = new Set();
      for (const s of specs) {
        const key = `${s.typeOnly ? "T" : "V"}|${s.name}|${s.alias || ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        uniq.push(s);
      }
      upsertNamedImport(sf, mod, uniq);
    }
    // Remove emptied imports
    toRemove.forEach(d => d.remove());
    changedFiles++;
  }
}

// Format + save
console.log(`Formatting ${changedFiles} changed files...`);
const prettierCfg = await prettier.resolveConfig(process.cwd());
for (const sf of project.getSourceFiles()) {
  if (!isCodeFile(sf)) continue;
  const text = sf.getFullText();
  const formatted = await prettier.format(text, {
    ...prettierCfg,
    filepath: sf.getFilePath(),
  });
  if (!DRY && formatted !== text) {
    sf.replaceWithText(formatted);
  }
}
if (!DRY) await project.save();

console.log(`\nStats:`);
console.log(`  Files processed: ${filesProcessed}`);
console.log(`  Imports from barrels found: ${importsFromBarrels}`);
console.log(`  Files updated: ${changedFiles}${DRY ? " (dry run)" : ""}`);
console.log("Done.");