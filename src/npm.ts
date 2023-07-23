import fs from 'fs';
import parser from '@babel/parser';
import traverse, { NodePath } from '@babel/traverse';
import { ImportDeclaration, CallExpression, StringLiteral } from '@babel/types';

export const getFileImports = async (filePath: string): Promise<string[]> => {
  const code = await fs.promises.readFile(filePath, 'utf-8');
  // Parse the JavaScript/TypeScript code into an Abstract Syntax Tree (AST)
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['dynamicImport', 'typescript'],
  });

  const imports: string[] = [];

  traverse(ast, {
    // This function is called when an import statement is encountered
    ImportDeclaration: ({ node }: NodePath<ImportDeclaration>) => {
      // node.source.value is the module path in import statement
      imports.push(node.source.value.split('/')[0]);
    },
    // This function is called when a function call is encountered
    CallExpression: ({ node }: NodePath<CallExpression>) => {
      // Check if the function call is an import() statement
      if (
        node.callee.type === 'Import' &&
        node.arguments[0].type === 'StringLiteral'
      ) {
        // node.arguments[0].value is the module path in dynamic import statement
        imports.push((node.arguments[0] as StringLiteral).value.split('/')[0]);
      }
    },
  });

  return Array.from(new Set(imports)); // Remove duplicates
};
