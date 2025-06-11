import * as acorn from 'acorn';
import tsPlugin from 'acorn-typescript';

// Extracts `arg()` call placeholders using Acorn + TypeScript plugin.
// Returns [{ name: "arg1", placeholder: "foo" }, …].
export async function extractArgPlaceholders(
  code: string,
): Promise<Array<{ name: string; placeholder: string | null }>> {
  const placeholders: Array<{ name: string; placeholder: string | null }> = [];
  let argIndex = 0;
  // Extend acorn with TypeScript parser to support .ts scripts.
  const Parser = (acorn.Parser as any).extend(tsPlugin() as any);

  // Parse JS/TS code to AST.
  const ast = Parser.parse(code, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    allowAwaitOutsideFunction: true,
    locations: true, // needed for acorn-typescript
  });

  walk(ast);

  return placeholders;

  // Depth-first walk of AST collecting arg() calls.
  function walk(node: any): void {
    if (!node || typeof node !== 'object') {
      return;
    }

    if (node.type === 'CallExpression' && node.callee?.name === 'arg') {
      argIndex += 1;
      const argName = `arg${argIndex}`;

      try {
        let placeholder: string | null = null;

        // 1. Check for options object containing `placeholder`.
        const objectArg = node.arguments?.find((arg: any) => arg?.type === 'ObjectExpression');
        if (objectArg) {
          const placeholderProp = objectArg.properties.find(
            (prop: any) => prop.key && (prop.key.name === 'placeholder' || prop.key.value === 'placeholder'),
          );
          if (placeholderProp?.value?.type === 'Literal' && placeholderProp.value.value !== undefined) {
            placeholder = placeholderProp.value.value as string;
          }
        }

        // 2. If still null, and first argument is string literal, use it.
        if (placeholder === null && node.arguments?.length > 0) {
          const firstArg = node.arguments[0];
          if (firstArg?.type === 'Literal' && typeof firstArg.value === 'string') {
            placeholder = firstArg.value as string;
          }
        }

        // 3. Push result (for select-style or others placeholder may remain null).
        placeholders.push({ name: argName, placeholder });
      } catch {
        placeholders.push({ name: argName, placeholder: null });
      }
    }

    // Walk child nodes.
    for (const key in node) {
      if (['type', 'start', 'end', 'loc', 'range'].includes(key)) {
        continue;
      }
      const value = (node as any)[key];
      if (Array.isArray(value)) {
        value.forEach(walk);
      } else if (value && typeof value === 'object') {
        walk(value);
      }
    }
  }
}
