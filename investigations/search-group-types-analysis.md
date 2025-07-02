# Search Group Types Analysis

## Overview
This document analyzes all the different group types and how they're handled in both grouped and non-grouped search paths in the search.ts file.

## Group Types Identified

### 1. Standard Choice Groups
- **Property**: `choice.group`
- **Handling**: Used to determine if grouped search should be enabled
- **Example**: `{ group: "Scripts", name: "My Script" }`

### 2. Special Groups Created During Search
- **"Match" Group**: Created for exact and best matches
- **"Alias" Group**: Created when an alias match is found
- **"Trigger" Group**: Created when a trigger match is found

### 3. Choice Properties That Affect Grouping

#### a. `info` Choices
- **Grouped Path**: Always shown at the top of results
- **Non-Grouped Path**: Filtered and shown first in combined results
- **Behavior**: Never filtered out by search

#### b. `miss` Choices
- **Grouped Path**: Shown in a separate miss group when no matches found
- **Non-Grouped Path**: Shown when no matches found or filtered to bottom
- **Behavior**: Only shown when search has no results

#### c. `pass` Choices
- **Grouped Path**: 
  - If string starting with `/`: Treated as regex pattern
  - Otherwise: Added to results if they match
  - **ISSUE**: Pass choices matched by regex are added to `groupedResults` instead of `passGroup`
- **Non-Grouped Path**: Included in fuzzy search results
- **Behavior**: Special handling for regex patterns

#### d. `skip` Choices
- **Grouped Path**: Filtered out from results (group separators)
- **Non-Grouped Path**: Not explicitly handled
- **Behavior**: Used for visual group headers

#### e. `hideWithoutInput` Choices
- **Grouped Path**: Hidden when input is empty
- **Non-Grouped Path**: Hidden when input is empty
- **Behavior**: Conditional visibility based on input

#### f. `asTyped` Choices
- **Grouped Path**: Generated dynamically when no exact matches
- **Non-Grouped Path**: Generated dynamically when no exact matches
- **Behavior**: Shows input as a selectable option

#### g. `exclude` Choices
- **Both Paths**: Filtered out before search begins
- **Behavior**: Never shown in results

## Inconsistencies and Issues Found

### 1. Pass Group Handling Issue
**Location**: Lines 183-191 in grouped search path
```typescript
if (result) {
  log.info(`Matched regex pass: ${choice?.pass} on ${choice?.name}`);
  groupedResults.push(createScoredChoice(choice)); // Should be passGroup.push
}
```
**Problem**: Pass choices that match regex are added directly to `groupedResults` instead of `passGroup`

### 2. Missing Pass Group in Final Results
**Location**: Line 261
```typescript
// Add pass choices that matched the regex
combinedResults.push(...passGroup);
```
**Problem**: `passGroup` is always empty because matches are added to wrong array

### 3. Info Choices Handling Inconsistency
- **Grouped Path**: Info choices are always included at the top
- **Non-Grouped Path**: Info choices go through fuzzy search first
- **Issue**: Different behavior between paths

### 4. Skip Property Handling
- **Grouped Path**: Explicitly filtered out (line 147)
- **Non-Grouped Path**: No explicit handling
- **Issue**: Inconsistent handling between paths

### 5. Group Headers for Pass Choices
- **Issue**: No group header is created for pass choices that match
- **Other groups** (exact, starts with) get headers, but pass group doesn't

### 6. Fuzzy Search Integration
- **Grouped Path**: Uses fuzzy search results + special handling
- **Non-Grouped Path**: Relies entirely on fuzzy search
- **Issue**: Different filtering logic between paths

## Recommendations

### 1. Fix Pass Group Handling
```typescript
// Line 184 should be:
passGroup.push(createScoredChoice(choice));
```

### 2. Add Pass Group Header
```typescript
// After line 260, add:
if (passGroup.length > 0) {
  combinedResults.push(
    createScoredChoice({
      name: 'Pattern Matches',
      group: 'Match',
      pass: false,
      skip: true,
      nameClassName: defaultGroupNameClassName,
      className: defaultGroupClassName,
      height: PROMPT.ITEM.HEIGHT.XXXS,
      id: Math.random().toString(),
    })
  );
}
```

### 3. Consistent Info Handling
- Info choices should be handled consistently in both paths
- Consider always showing them at top without fuzzy search

### 4. Document Special Properties
- Create clear documentation for how each property affects search
- Define priority order for conflicting properties

### 5. Unify Skip Handling
- Apply skip filtering consistently in both paths
- Or remove skip filtering if group headers should be searchable

## Summary
The search functionality handles multiple types of groups and special choice properties, but there are inconsistencies between grouped and non-grouped paths. The most significant issue is the incorrect handling of pass choices in grouped search, where matched items are added to the wrong array. Additionally, different properties (info, skip, pass) are handled differently between the two code paths, leading to potentially confusing behavior.