import { type ZodObject, type ZodRawShape, z } from 'zod';
import { UNDEFINED_VALUE } from './handleScript';
import { mcpLog as log } from './logs';

export interface ParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
  required?: boolean;
  default?: unknown;
}

/**
 * Create tool schema based on script args (simple positional args)
 */
export function createToolSchema(
  args: Array<{ name: string; placeholder: string | null }>,
  useDefaultValue = false,
): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [index, arg] of args.entries()) {
    const key = arg.name?.trim() ? arg.name : `arg${index + 1}`;
    log.info(`[createToolSchema] arg: ${arg.name} ${arg.placeholder}`);

    const schema = z.string().describe(arg.placeholder || arg.name || `Parameter ${index + 1}`);

    if (useDefaultValue) {
      shape[key] = schema.default(UNDEFINED_VALUE).optional();
    } else {
      shape[key] = schema.optional();
    }
  }

  return shape;
}

/**
 * Create tool schema from tool() config or params() inputSchema
 */
export function createToolSchemaFromConfig(
  parameters: Record<string, ParameterSchema>,
  required?: string[],
): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, param] of Object.entries(parameters)) {
    let schema: z.ZodTypeAny;

    // Map parameter types to Zod schemas
    switch (param.type) {
      case 'string': {
        schema = z.string();
        if (param.enum) {
          schema = z.enum(param.enum as [string, ...string[]]);
        }
        if (param.pattern) {
          schema = (schema as z.ZodString).regex(new RegExp(param.pattern));
        }
        break;
      }

      case 'number': {
        schema = z.number();
        if (param.minimum !== undefined) {
          schema = (schema as z.ZodNumber).min(param.minimum);
        }
        if (param.maximum !== undefined) {
          schema = (schema as z.ZodNumber).max(param.maximum);
        }
        break;
      }

      case 'boolean':
        schema = z.boolean();
        break;

      case 'array':
        // Simple array support for now
        schema = z.array(z.string());
        break;

      case 'object':
        // Simple object support for now
        schema = z.object({});
        break;

      default:
        schema = z.string();
    }

    // Add description
    if (param.description) {
      schema = schema.describe(param.description);
    }

    // Handle required/optional
    // Check if this parameter is in the required array (for inputSchema)
    // or if param.required is false (for toolConfig)
    const isRequired = required ? required.includes(key) : param.required !== false;
    if (!isRequired) {
      schema = schema.optional();
    }

    // Handle default values
    if (param.default !== undefined) {
      schema = schema.default(param.default);
    }

    shape[key] = schema;
  }

  return shape;
}

/**
 * Wrap a shape in z.object() for ZodObject return type
 */
export function wrapInObject(shape: Record<string, z.ZodTypeAny>): ZodObject<ZodRawShape> {
  return z.object(shape);
}
