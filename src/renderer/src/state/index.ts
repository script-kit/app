// =================================================================================================
// Re-export all atoms from the original jotai.ts file
// This ensures backward compatibility while the migration is in progress
// =================================================================================================

// Re-export everything from the original jotai.ts file for now
export * from '../jotai';

// As we migrate atoms to the new structure, we'll update this file to import from the new locations
// For example:
// export * from './app-core';
// export * from './script-state';
// export * from './prompt-data';
// export * from './input-state';
// etc.