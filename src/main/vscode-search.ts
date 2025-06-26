import type { Choice } from '@johnlindquist/kit/types/core';
import type { IMatch } from 'vscode-fuzzy-scorer';
import { scoreItemFuzzy, prepareQuery, compareItemsByFuzzyScore } from 'vscode-fuzzy-scorer';
import { searchLog as log } from './logs';
import type { ScoredChoice } from '../shared/types';
import { createScoredChoice } from './helpers';

// Cache for prepared queries
const queryCache = new Map<string, any>();

// Custom accessor for our Choice objects
const choiceAccessor = {
  getItemLabel: (choice: Choice): string => {
    // Ensure we always return a string, avoid "undefined" string
    if (!choice || !choice.name) return '';
    return String(choice.name);
  },
  getItemDescription: (choice: Choice): string | undefined => {
    // Include description as primary description field
    if (choice?.description) return String(choice.description);
    
    // Otherwise combine other searchable fields
    const parts: string[] = [];
    if (choice?.keyword) parts.push(String(choice.keyword));
    if (choice?.tag) parts.push(String(choice.tag));
    return parts.length > 0 ? parts.join(' ') : undefined;
  },
  getItemPath: (choice: Choice): undefined => undefined // Not using path-based scoring
};

// Convert IMatch array to our expected format
function convertMatches(matches: IMatch[] | undefined): Array<[number, number]> | undefined {
  if (!matches || matches.length === 0) return undefined;
  return matches.map(m => [m.start, m.end]);
}

// Score a single choice against a query
export function scoreChoice(choice: Choice, query: string): ScoredChoice | null {
  if (!query || query.trim() === '') {
    // Empty query returns all choices with no highlighting
    return createScoredChoice(choice);
  }

  // Note: We score all choices including pass/miss/info
  // The main search logic will handle their special behavior

  // Get or create prepared query
  let preparedQuery = queryCache.get(query);
  if (!preparedQuery) {
    preparedQuery = prepareQuery(query);
    queryCache.set(query, preparedQuery);
  }

  // Use VS Code's item fuzzy scorer
  const fuzzy = true; // Enable fuzzy matching
  const cache = {}; // Local cache for this scoring operation
  
  const itemScore = scoreItemFuzzy(
    choice,
    preparedQuery,
    fuzzy,
    choiceAccessor,
    cache
  );

  // More detailed logging
  const label = choiceAccessor.getItemLabel(choice);
  const description = choiceAccessor.getItemDescription(choice);
  
  // Temporarily use warn level to ensure visibility
  if (!itemScore) {
    log.warn(`No itemScore returned for "${label}" with query "${query}"`);
    return null;
  }
  
  log.info(`Score for "${label}" = ${itemScore.score} (query: "${query}")`);

  // If no match or score too low, return null
  // VS Code uses negative scores for no match, positive for matches
  if (itemScore.score <= 0) {
    return null;
  }

  const scoredChoice = createScoredChoice(choice);
  scoredChoice.score = itemScore.score;

  // Map VS Code's match format to our format
  scoredChoice.matches = {};
  
  if (itemScore.labelMatch && itemScore.labelMatch.length > 0) {
    scoredChoice.matches.name = convertMatches(itemScore.labelMatch);
  }
  
  if (itemScore.descriptionMatch && itemScore.descriptionMatch.length > 0) {
    // Apply description matches to the description field if it exists
    if (choice.description) {
      scoredChoice.matches.description = convertMatches(itemScore.descriptionMatch);
    } else if (choice.keyword) {
      // Otherwise apply to keyword or tag
      scoredChoice.matches.keyword = convertMatches(itemScore.descriptionMatch);
    } else if (choice.tag) {
      scoredChoice.matches.tag = convertMatches(itemScore.descriptionMatch);
    }
  }

  return scoredChoice;
}

// Search and score all choices
export function searchChoices(choices: Choice[], query: string): ScoredChoice[] {
  log.info(`searchChoices called with ${choices.length} choices and query "${query}"`);
  const results: ScoredChoice[] = [];

  // Handle empty query - return all non-hidden choices
  if (!query || query.trim() === '') {
    for (const choice of choices) {
      if (!choice.hideWithoutInput) {
        results.push(createScoredChoice(choice));
      }
    }
    log.info(`Empty query - returning ${results.length} results`);
    return results;
  }

  // Get or create prepared query
  let preparedQuery = queryCache.get(query);
  if (!preparedQuery) {
    preparedQuery = prepareQuery(query);
    queryCache.set(query, preparedQuery);
  }

  for (const choice of choices) {
    const scored = scoreChoice(choice, query);
    if (scored) {
      results.push(scored);
    }
  }

  // Sort by score (highest first) using VS Code's comparison
  if (results.length > 0) {
    results.sort((a, b) => {
      return compareItemsByFuzzyScore(
        a.item,
        b.item,
        preparedQuery,
        true, // fuzzy
        choiceAccessor,
        {} // cache
      );
    });
  }

  log.info(`Returning ${results.length} scored results for query "${query}"`);
  return results;
}

// Clear the cache (useful when choices change significantly)
export function clearFuzzyCache(): void {
  queryCache.clear();
}

// Check if a string matches exactly (for exact match detection)
export function isExactMatch(choice: Choice, query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return (
    choice.name?.toLowerCase() === lowerQuery ||
    choice.keyword?.toLowerCase() === lowerQuery ||
    (choice as any).alias?.toLowerCase() === lowerQuery ||
    (choice as any).trigger?.toLowerCase() === lowerQuery
  );
}

// Check if a string starts with the query (for startsWith detection)
export function startsWithQuery(choice: Choice, query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return (
    choice.name?.toLowerCase().startsWith(lowerQuery) ||
    choice.keyword?.toLowerCase().startsWith(lowerQuery)
  );
}