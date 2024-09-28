export const compareArrays = (arr1: any[], arr2: any[]) => {
  if (!(Array.isArray(arr1) && Array.isArray(arr2)) || arr1.length !== arr2.length) {
    return false;
  }

  for (let i = 0; i < arr1.length; i++) {
    if (!Object.is(arr1[i], arr2[i])) {
      return false;
    }
  }

  return true;
};

/**
 * Compares two objects and returns an object describing the differences.
 * @param obj1 The first object to compare
 * @param obj2 The second object to compare
 * @returns An object describing the differences between obj1 and obj2
 */
export function compareObjects(obj1: any, obj2: any): Record<string, { old: any; new: any }> {
  const differences: Record<string, { old: any; new: any }> = {};

  // Helper function to check if a value is an object
  const isObject = (value: any) => typeof value === 'object' && value !== null;

  // Recursive function to compare nested objects
  const compare = (a: any, b: any, path = '') => {
    // If both values are objects, compare their properties
    if (isObject(a) && isObject(b)) {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const key of keys) {
        compare(a[key], b[key], path ? `${path}.${key}` : key);
      }
    } else if (a !== b) {
      // If values are different, record the difference
      differences[path] = { old: a, new: b };
    }
  };

  compare(obj1, obj2);
  return differences;
}
