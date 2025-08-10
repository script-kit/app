// =================================================================================================
// Re-export all atoms through the facade pattern
// This ensures backward compatibility while the migration is in progress
// =================================================================================================

// Use the facade pattern for jotai exports - this allows gradual migration
export * from './facade';

// Re-export utility modules
export * from './constants';
export * from './utils';
export * from './dom-ids';
export * from './skip-nav';
export * from './resize/compute';
export * from './reset';

// As we migrate atoms to the new structure, the facade will handle the redirects
// This allows us to move atoms without breaking imports