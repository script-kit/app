// =================================================================================================
// Re-export all atoms from the original jotai.ts file
// This ensures backward compatibility while the migration is in progress
// =================================================================================================

// Re-export everything from the original jotai.ts file for now
export * from '../jotai';

// Re-export utility modules
export * from './constants';
export * from './utils';
export * from './dom-ids';
export * from './skip-nav';
export * from './resize/compute';
export * from './reset';

// As we migrate atoms to the new structure, the facade will handle the redirects
// This allows us to move atoms without breaking imports