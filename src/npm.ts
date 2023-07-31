/* eslint-disable default-case */
import ts from 'typescript';
import { existsSync, readFileSync } from 'fs';
import log from 'electron-log';
import builtins from 'builtin-modules';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export async function getFileImports(
  filePath: string,
  rootPackagePath: string,
  kenvPackagePath?: string
): Promise<string[]> {
  if (!existsSync(rootPackagePath)) {
    log.error(`Could not find package.json at ${rootPackagePath}`);

    return [];
  }

  const packageJson: PackageJson = JSON.parse(
    readFileSync(rootPackagePath, 'utf8')
  );
  const projectPackages = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  if (kenvPackagePath && existsSync(kenvPackagePath)) {
    const kenvPackageJson: PackageJson = JSON.parse(
      readFileSync(kenvPackagePath, 'utf8')
    );
    Object.assign(projectPackages, {
      ...kenvPackageJson.dependencies,
      ...kenvPackageJson.devDependencies,
    });
  }

  let sourceFile: ts.SourceFile;
  try {
    const contents = readFileSync(filePath, 'utf8');
    sourceFile = ts.createSourceFile(
      filePath,
      contents,
      ts.ScriptTarget.ES2022,
      true
    );
  } catch (error) {
    return [];
  }

  const missingImports: string[] = [];

  const addImport = (importPath: string) => {
    if (
      !importPath.startsWith('@johnlindquist/kit') &&
      !importPath.startsWith('.') &&
      !importPath.startsWith('/') &&
      !importPath.startsWith('\\') &&
      !projectPackages[importPath] &&
      !builtins.includes(importPath)
    ) {
      if (importPath.includes('/')) {
        const [scope, packageName] = importPath.split('/');
        if (scope.startsWith('@') && packageName) {
          const scopedPackageName = `${scope}/${packageName}`;
          if (
            !projectPackages[scopedPackageName] &&
            !builtins.includes(scope)
          ) {
            missingImports.push(scopedPackageName);
          }
        } else if (!projectPackages[scope] && !builtins.includes(scope)) {
          missingImports.push(scope);
        }
      } else {
        missingImports.push(importPath);
      }
    }
  };

  const visit = (node: ts.Node): void => {
    switch (node.kind) {
      case ts.SyntaxKind.ImportDeclaration: {
        // Static import.
        const importPath = (node as ts.ImportDeclaration).moduleSpecifier
          .getText()
          .replace(/['"`]/g, '');
        addImport(importPath);
        break;
      }
      case ts.SyntaxKind.CallExpression: // Dynamic import.
        if (
          (node as ts.CallExpression).expression.kind ===
          ts.SyntaxKind.ImportKeyword
        ) {
          const dynamicImportPath = (
            (node as ts.CallExpression).arguments[0] as ts.StringLiteral
          ).text;

          addImport(dynamicImportPath);
        }
        break;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return missingImports;
}
