// Test script for setActions functionality
// Run this in Script Kit to test the current behavior

const testActions = [
  {
    name: "Copy",
    description: "Copy to clipboard",
    shortcut: "cmd+c",
    onAction: async () => {
      await div("Copy action triggered!");
    }
  },
  {
    name: "Paste",
    description: "Paste from clipboard", 
    shortcut: "cmd+v",
    onAction: async () => {
      await div("Paste action triggered!");
    }
  },
  {
    name: "Delete",
    description: "Delete selected item",
    shortcut: "cmd+d",
    onAction: async () => {
      await div("Delete action triggered!");
    }
  }
];

// Test with small number of actions
console.log("Testing with 3 actions...");
await setActions(testActions);
await arg("Select an action (small test)");

// Test with larger number of actions
console.log("Testing with 100 actions...");
const largeActions = Array.from({ length: 100 }, (_, i) => ({
  name: `Action ${i}`,
  description: `Description for action ${i}`,
  onAction: async () => {
    await div(`Action ${i} triggered!`);
  }
}));

await setActions(largeActions);
await arg("Select an action (large test)");

// Test rapid updates
console.log("Testing rapid updates...");
for (let i = 0; i < 5; i++) {
  const dynamicActions = Array.from({ length: 20 }, (_, j) => ({
    name: `Dynamic ${i}-${j}`,
    description: `Update batch ${i}`,
    onAction: async () => {
      await div(`Dynamic action ${i}-${j} triggered!`);
    }
  }));
  
  await setActions(dynamicActions);
  await wait(100); // Small delay between updates
}

await arg("Select an action (after rapid updates)");

console.log("Test completed!");