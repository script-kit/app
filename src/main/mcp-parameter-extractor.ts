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
 * 
 * Also extracts parameters from `await tool(...)` calls with full schema support.
 */
export async function extractMCPToolParameters(code: string): Promise<MCPToolParameter[] | { toolConfig: any }> {
    const params: MCPToolParameter[] = [];
    let argIndex = 0;
    let toolConfig: any = null;

    const Parser = (acorn.Parser as any).extend(tsPlugin() as any);
    const ast = Parser.parse(code, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        allowAwaitOutsideFunction: true,
        locations: true,
    });

    function walk(node: any, parent: any = null) {
        if (!node || typeof node !== 'object') return;

        // Check for tool() calls
        if (node.type === 'CallExpression' && node.callee?.name === 'tool' && node.arguments?.length > 0) {
            const configArg = node.arguments[0];
            if (configArg?.type === 'ObjectExpression') {
                toolConfig = extractObjectLiteral(configArg);
                return; // If we find a tool() call, we don't need to look for arg() calls
            }
        }

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
    
    // If we found a tool() call, return the tool config
    if (toolConfig) {
        return { toolConfig };
    }
    
    return params;
}

function extractObjectLiteral(node: any): any {
    if (node.type !== 'ObjectExpression') return null;
    
    const obj: any = {};
    
    for (const prop of node.properties) {
        if (prop.type !== 'Property') continue;
        
        const key = prop.key.name || prop.key.value;
        
        if (prop.value.type === 'Literal') {
            obj[key] = prop.value.value;
        } else if (prop.value.type === 'ObjectExpression') {
            obj[key] = extractObjectLiteral(prop.value);
        } else if (prop.value.type === 'ArrayExpression') {
            obj[key] = prop.value.elements.map((el: any) => {
                if (el.type === 'Literal') return el.value;
                if (el.type === 'ObjectExpression') return extractObjectLiteral(el);
                return null;
            }).filter((v: any) => v !== null);
        } else {
            // For complex expressions, we'll need to evaluate them later
            obj[key] = null;
        }
    }
    
    return obj;
}
