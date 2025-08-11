import { readFile } from 'node:fs/promises';
import { getScripts } from '@johnlindquist/kit/core/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mcpService } from './mcp-service';

// Mock dependencies
vi.mock('@johnlindquist/kit/core/db');
vi.mock('fs/promises');
vi.mock('./log-utils', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('./state', () => ({
  kitState: {
    scripts: new Map(),
    kenvPath: '/mock/kenv',
  },
  subs: [],
}));

describe('MCP Parameter Validation', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mcpService.clearCache();
    const { kitState } = await import('./state');
    kitState.scripts.clear();
  });

  describe('Parameter Description Extraction', () => {
    it('should extract placeholders as parameter descriptions', async () => {
      const testScript = `
// Name: Test Script
// Description: Test parameter extraction
// mcp: test-tool

import "@johnlindquist/kit"

const username = await arg({
  placeholder: "Enter your username"
})

const password = await arg("Enter your password")

const action = await arg({
  placeholder: "Select an action",
  choices: ["create", "update", "delete"]
})

await sendResponse({ content: [{ type: 'text', text: 'done' }] })
`;

      const mockScripts = [
        {
          name: 'test-script',
          command: 'test-script',
          filePath: '/test/test-script.js',
          description: 'Test parameter extraction',
          mcp: 'test-tool',
        },
      ];

      vi.mocked(getScripts).mockResolvedValue(mockScripts as any);
      vi.mocked(readFile).mockResolvedValue(testScript);
      
      // Add script to mocked kitState
      const { kitState } = await import('./state');
      kitState.scripts.set('test-script', mockScripts[0]);

      const scripts = await mcpService.getMCPScripts();

      expect(scripts).toHaveLength(1);
      const script = scripts[0];

      // Validate extracted args
      expect(script.args).toHaveLength(3);

      // username with placeholder
      expect(script.args[0]).toEqual({
        name: 'username',
        placeholder: 'Enter your username',
      });

      // password with prompt text
      expect(script.args[1]).toEqual({
        name: 'password',
        placeholder: 'Enter your password',
      });

      // action with placeholder
      expect(script.args[2]).toEqual({
        name: 'action',
        placeholder: 'Select an action',
      });
    });

    it('should handle complex arg patterns', async () => {
      const complexScript = `
// Name: Complex Args
// Description: Test complex argument patterns
// mcp: complex-tool

import "@johnlindquist/kit"

// Nested in condition
if (true) {
  const conditional = await arg("Conditional argument")
}

// In a loop
for (let i = 0; i < 1; i++) {
  const looped = await arg({ placeholder: "Looped argument" })
}

// In a function
async function helper() {
  const nested = await arg({ placeholder: "Nested function argument" })
  return nested
}

// Object with properties
const config = await arg({
  placeholder: "Enter configuration",
  hint: "JSON format",
  validate: (value) => {
    try {
      JSON.parse(value)
      return true
    } catch {
      return "Invalid JSON"
    }
  }
})

// Multiple placeholders in template string
const formatted = await arg({
  placeholder: \`Enter value for \${config}\`
})

await sendResponse({ content: [{ type: 'text', text: 'done' }] })
`;

      const mockScripts = [
        {
          name: 'complex-script',
          command: 'complex-script',
          filePath: '/test/complex-script.js',
          description: 'Test complex argument patterns',
          mcp: 'complex-tool',
        },
      ];

      vi.mocked(getScripts).mockResolvedValue(mockScripts as any);
      vi.mocked(readFile).mockResolvedValue(complexScript);

      // Add script to mocked kitState
      const { kitState } = await import('./state');
      kitState.scripts.set('complex-script', mockScripts[0]);

      const scripts = await mcpService.getMCPScripts();
      const script = scripts[0];

      // Should extract all args regardless of context
      expect(script.args.length).toBeGreaterThanOrEqual(4);

      // Check specific placeholders
      const placeholders = script.args.map((arg) => arg.placeholder).filter(Boolean);
      expect(placeholders).toContain('Conditional argument');
      expect(placeholders).toContain('Looped argument');
      expect(placeholders).toContain('Nested function argument');
      expect(placeholders).toContain('Enter configuration');
    });

    it('should handle scripts with no arguments', async () => {
      const noArgsScript = `
// Name: No Args
// Description: Script without arguments
// mcp: no-args-tool

import "@johnlindquist/kit"

const result = { message: "No args needed" }

await sendResponse({
  content: [{
    type: 'text',
    text: JSON.stringify(result)
  }]
})
`;

      const mockScripts = [
        {
          name: 'no-args-script',
          command: 'no-args-script',
          filePath: '/test/no-args-script.js',
          description: 'Script without arguments',
          mcp: 'no-args-tool',
        },
      ];

      vi.mocked(getScripts).mockResolvedValue(mockScripts as any);
      vi.mocked(readFile).mockResolvedValue(noArgsScript);

      // Add script to mocked kitState
      const { kitState } = await import('./state');
      kitState.scripts.set('no-args-script', mockScripts[0]);

      const scripts = await mcpService.getMCPScripts();
      const script = scripts[0];

      expect(script.args).toEqual([]);
    });

    it('should extract choice values for enum parameters', async () => {
      const choicesScript = `
// Name: Choices Test
// Description: Test choice extraction
// mcp: choices-tool

import "@johnlindquist/kit"

// Simple array choices
const color = await arg({
  placeholder: "Pick a color",
  choices: ["red", "green", "blue"]
})

// Object choices with values
const operation = await arg({
  placeholder: "Select operation",
  choices: [
    { name: "Create New", value: "create" },
    { name: "Update Existing", value: "update" },
    { name: "Delete", value: "delete" }
  ]
})

// Dynamic choices
const items = ["item1", "item2", "item3"]
const selected = await arg({
  placeholder: "Select an item",
  choices: items
})

await sendResponse({ content: [{ type: 'text', text: 'done' }] })
`;

      const mockScripts = [
        {
          name: 'choices-script',
          command: 'choices-script',
          filePath: '/test/choices-script.js',
          description: 'Test choice extraction',
          mcp: 'choices-tool',
        },
      ];

      vi.mocked(getScripts).mockResolvedValue(mockScripts as any);
      vi.mocked(readFile).mockResolvedValue(choicesScript);

      // Add script to mocked kitState
      const { kitState } = await import('./state');
      kitState.scripts.set('choices-script', mockScripts[0]);

      const scripts = await mcpService.getMCPScripts();
      const script = scripts[0];

      // Should have 3 args
      expect(script.args).toHaveLength(3);

      expect(script.args[0].placeholder).toBe('Pick a color');
      expect(script.args[1].placeholder).toBe('Select operation');
      expect(script.args[2].placeholder).toBe('Select an item');
    });
  });

  describe('MCP Tool Schema Generation', () => {
    it('should generate proper tool schema for AI agents', async () => {
      const aiScript = `
// Name: AI Assistant Tool
// Description: Help AI agents perform tasks
// mcp: ai-assistant

import "@johnlindquist/kit"

const task = await arg({
  placeholder: "What task should I help with?",
  choices: [
    { name: "Write Code", value: "code", description: "Generate or modify code" },
    { name: "Answer Question", value: "answer", description: "Provide information" },
    { name: "Analyze Data", value: "analyze", description: "Process and analyze data" }
  ]
})

const context = await arg({
  placeholder: "Provide context or details for the task",
  hint: "Be specific about what you need"
})

const format = await arg({
  placeholder: "Select output format",
  choices: ["markdown", "json", "plain text"],
  default: "markdown"
})

await sendResponse({
  content: [{
    type: 'text',
    text: JSON.stringify({ task, context, format })
  }]
})
`;

      const mockScripts = [
        {
          name: 'ai-assistant',
          command: 'ai-assistant',
          filePath: '/test/ai-assistant.js',
          description: 'Help AI agents perform tasks',
          mcp: 'ai-assistant',
        },
      ];

      vi.mocked(getScripts).mockResolvedValue(mockScripts as any);
      vi.mocked(readFile).mockResolvedValue(aiScript);

      // Add script to mocked kitState
      const { kitState } = await import('./state');
      kitState.scripts.set('ai-assistant', mockScripts[0]);

      const scripts = await mcpService.getMCPScripts();
      const script = scripts[0];

      // Simulate what would be sent to MCP
      const toolSchema = {
        name: script.name,
        description: script.description,
        inputSchema: {
          type: 'object',
          properties: script.args.reduce(
            (acc, arg) => {
              acc[arg.name] = {
                type: 'string',
                description: arg.placeholder || `Parameter ${arg.name}`,
              };
              return acc;
            },
            {} as Record<string, any>,
          ),
        },
      };

      // Validate the schema
      expect(toolSchema.name).toBe('ai-assistant');
      expect(toolSchema.description).toBe('Help AI agents perform tasks');

      const properties = toolSchema.inputSchema.properties;

      // Each parameter should have meaningful descriptions
      expect(properties.task.description).toBe('What task should I help with?');
      expect(properties.context.description).toBe('Provide context or details for the task');
      expect(properties.format.description).toBe('Select output format');
    });
  });
});
