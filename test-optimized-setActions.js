// Test script to verify optimized setActions performance
// Run this after the changes to compare with the original behavior

console.log("Testing optimized setActions performance...");

// Test 1: Rapid consecutive updates
console.time("Rapid Updates Test");
for (let i = 0; i < 10; i++) {
  const actions = Array.from({ length: 50 }, (_, j) => ({
    name: `Action ${i}-${j}`,
    description: `Batch ${i} Action ${j}`,
    onAction: async () => {
      await div(`Action ${i}-${j} executed`);
    }
  }));
  
  await setActions(actions);
}
console.timeEnd("Rapid Updates Test");

// Test 2: Large action list
console.time("Large List Test");
const largeActions = Array.from({ length: 500 }, (_, i) => ({
  name: `Large Action ${i}`,
  description: `Description for action ${i}`,
  shortcut: i < 10 ? `cmd+${i}` : undefined,
  onAction: async () => {
    await div(`Large Action ${i} executed`);
  }
}));

await setActions(largeActions);
console.timeEnd("Large List Test");

// Test 3: User interaction test
await arg("Type to search through 500 actions (should feel smooth now)");

// Test 4: Mixed height actions
console.time("Mixed Heights Test");
const mixedHeightActions = Array.from({ length: 100 }, (_, i) => ({
  name: `Mixed ${i}`,
  description: `Height varies`,
  height: i % 3 === 0 ? 64 : i % 5 === 0 ? 48 : undefined,
  onAction: async () => {
    await div(`Mixed action ${i}`);
  }
}));

await setActions(mixedHeightActions);
console.timeEnd("Mixed Heights Test");

await arg("Select an action from mixed heights");

console.log("All performance tests completed!");
console.log("Compare the timing results with the original implementation.");