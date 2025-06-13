# Tool Global Documentation

The `tool()` global provides a powerful way to define MCP (Model Context Protocol) tools in Script Kit that can be invoked through multiple interfaces: MCP clients, CLI, or Script Kit's interactive UI.

## Quick Start

```typescript
// Name: Calculator
// Description: Perform calculations
// mcp: calculator

import "@johnlindquist/kit"

const { operation, a, b } = await tool({
  name: "calculator",
  description: "Perform mathematical operations",
  parameters: {
    operation: {
      type: "string",
      enum: ["add", "subtract", "multiply", "divide"],
      required: true
    },
    a: { type: "number", required: true },
    b: { type: "number", required: true }
  }
})

const result = operation === "add" ? a + b : a - b
await sendResponse({ result })
```

## Key Features

- **Familiar API**: Works like `arg()`, returning parameters instead of requiring callbacks
- **Multi-mode**: Same script works as MCP tool, CLI command, or interactive UI
- **Type-safe**: Full TypeScript support with parameter validation
- **Auto-discovery**: Tools are automatically discovered and registered with MCP

## Usage Modes

### 1. MCP Client
```json
{
  "method": "tools/call",
  "params": {
    "name": "calculator",
    "arguments": {
      "operation": "add",
      "a": 5,
      "b": 3
    }
  }
}
```

### 2. CLI
```bash
kit calculator --operation add --a 5 --b 3
```

### 3. Interactive UI
```bash
kit calculator
# Prompts for each parameter
```

See the full documentation in `/kit-workspace/docs/tool-global.md` for complete details.