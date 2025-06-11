import * as acorn from 'acorn';
import tsPlugin from 'acorn-typescript';

export interface MCPToolParameter {
    name: string;
    placeholder: string | null;
}

/**
 * Extracts parameters from Script Kit scripts.
 * For each `await arg(...)` call it attempts to resolve:
 * 1. variable name assigned (e.g., `const name = await arg(...)` -> name="name")
 * 2. placeholder text (from config placeholder or first string literal argument)
 */
export async function extractMCPToolParameters(code: string): Promise<MCPToolParameter[]> {
    const params: MCPToolParameter[] = [];
    let argIndex = 0;

    const Parser = (acorn.Parser as any).extend(tsPlugin() as any);
    const ast = Parser.parse(code, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        allowAwaitOutsideFunction: true,
        locations: true,
    });

    function walk(node: any, parent: any = null) {
        if (!node || typeof node !== 'object') return;

        if (node.type === 'CallExpression' && node.callee?.name === 'arg') {
            argIndex += 1;
            let varName: string | null = null;
            // Traverse up parents to find variable name (handles AwaitExpression wrapper)
            let currentParent: any = parent;
            while (currentParent && !varName) {
                if (currentParent.type === 'VariableDeclarator' && currentParent.id?.type === 'Identifier') {
                    varName = currentParent.id.name;
                } else if (currentParent.type === 'AssignmentExpression' && currentParent.left?.type === 'Identifier') {
                    varName = currentParent.left.name;
                } else {
                    currentParent = (currentParent as any).__parent;
                }
            }
            if (!varName) varName = `arg${argIndex}`;

            // Determine placeholder
            let placeholder: string | null = null;
            const objectArg = node.arguments?.find((a: any) => a?.type === 'ObjectExpression');
            if (objectArg) {
                const placeholderProp = objectArg.properties.find((p: any) =>
                    p.key && (p.key.name === 'placeholder' || p.key.value === 'placeholder'),
                );
                if (placeholderProp?.value?.type === 'Literal') {
                    placeholder = placeholderProp.value.value;
                }
            }
            if (placeholder === null && node.arguments?.length > 0) {
                const firstArg = node.arguments[0];
                if (firstArg?.type === 'Literal' && typeof firstArg.value === 'string') {
                    placeholder = firstArg.value;
                }
            }

            params.push({ name: varName, placeholder });
        }

        for (const key in node) {
            if (['type', 'start', 'end', 'loc', 'range', '__parent'].includes(key)) continue;
            const value = node[key];
            if (Array.isArray(value)) {
                value.forEach((child) => {
                    if (child && typeof child === 'object') (child as any).__parent = node;
                    walk(child, node);
                });
            } else if (value && typeof value === 'object') {
                (value as any).__parent = node;
                walk(value, node);
            }
        }
    }

    walk(ast, null);
    return params;
}
