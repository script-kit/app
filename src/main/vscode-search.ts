import type { Choice } from '@johnlindquist/kit/types/core';
import type { IItemScore, IMatch } from 'vscode-fuzzy-scorer';
import { compareItemsByFuzzyScore, prepareQuery, scoreItemFuzzy } from 'vscode-fuzzy-scorer';
import type { ScoredChoice } from '../shared/types';
import { getFrecencyScores } from './frecency';
import { createScoredChoice } from './helpers';
import { searchLog as log } from './logs';

// Cache for prepared queries
const queryCache = new Map<string, any>();

// Search cancellation support
let currentSearchId = 0;

/**
 * Generate a new search ID for cancellation tracking
 */
export function getNextSearchId(): number {
  return ++currentSearchId;
}

/**
 * Check if a search is still current (not cancelled)
 */
export function isSearchCurrent(searchId: number): boolean {
  return searchId === currentSearchId;
}

// Config for result limiting
export const SEARCH_CONFIG = {
  /** Maximum results per category in grouped mode */
  MAX_RESULTS_PER_GROUP: 50,
  /** Maximum total results */
  MAX_TOTAL_RESULTS: 200,
  /** Filename match weight multiplier (vs full path) */
  FILENAME_WEIGHT: 2.5,
  /** Frecency weight (how much frecency affects final score) */
  FRECENCY_WEIGHT: 0.3,
};

// Convert IMatch array to our expected format
function convertMatches(matches: IMatch[] | undefined): Array<[number, number]> | undefined {
  if (!matches || matches.length === 0) return undefined;
  return matches.map((m) => [m.start, m.end]);
}

// Split text by both spaces and path separators
function splitIntoWords(text: string): string[] {
  // Split by spaces, forward slashes, and backslashes
  return text.split(/[\s/\\]+/).filter((w) => w.length > 0);
}

// Check if query matches as a mnemonic (first letters of words)
function isMnemonicMatch(text: string, query: string): boolean {
  if (!text || !query) return false;

  const words = splitIntoWords(text);
  const queryLower = query.toLowerCase();

  // Try to match query letters to first letters of consecutive words
  for (let startWord = 0; startWord <= words.length - queryLower.length; startWord++) {
    let matches = true;

    for (let i = 0; i < queryLower.length; i++) {
      const word = words[startWord + i];
      if (!word || word[0].toLowerCase() !== queryLower[i]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return true;
    }
  }

  return false;
}

// Check if matches are from sequential words (mnemonic matching)
function isSequentialWordMatch(text: string, matches: Array<[number, number]>, query: string): boolean {
  if (!text || !matches || matches.length === 0) return false;

  // First check if it's a mnemonic match
  if (isMnemonicMatch(text, query)) {
    return true;
  }

  // Otherwise check if matches are from beginning of sequential words
  const words: { text: string; start: number; end: number }[] = [];
  let position = 0;

  // Split by spaces and path separators, but keep track of positions
  const parts = text.split(/([\s/\\]+)/);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part && !/^[\s/\\]+$/.test(part)) {
      // This is a word, not a separator
      words.push({
        text: part,
        start: position,
        end: position + part.length,
      });
    }
    position += part.length;
  }

  if (words.length < 2) return false;

  // Find which word each match belongs to and if it's at the start
  const matchedWordIndices: Set<number> = new Set();

  for (const [matchStart, matchEnd] of matches) {
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      // Check if match starts at the beginning of this word
      if (matchStart === word.start) {
        matchedWordIndices.add(i);
        break;
      }
    }
  }

  // Convert to array and sort
  const sortedIndices = Array.from(matchedWordIndices).sort((a, b) => a - b);

  // Need at least 2 matched words
  if (sortedIndices.length < 2) return false;

  // Check if all matched words are sequential
  for (let i = 1; i < sortedIndices.length; i++) {
    if (sortedIndices[i] !== sortedIndices[i - 1] + 1) {
      return false;
    }
  }

  return true;
}

/**
 * Extract the filename (basename) from a path
 */
function getBasename(path: string): string {
  const lastSlash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
}

/**
 * Score a single choice against a query with independent field matching
 * Improvements:
 * - Path-aware scoring (filename matches weighted higher than path)
 * - Better handling of path separators
 */
export function scoreChoice(
  choice: Choice,
  query: string,
  searchKeys: string[] = ['name', 'keyword', 'tag'],
): ScoredChoice | null {
  if (!query || query.trim() === '') {
    // Empty query returns all choices with no highlighting
    return createScoredChoice(choice);
  }

  // Get or create prepared query
  let preparedQuery = queryCache.get(query);
  if (!preparedQuery) {
    preparedQuery = prepareQuery(query);
    queryCache.set(query, preparedQuery);
  }

  let totalScore = 0;
  const allMatches: { [key: string]: Array<[number, number]> } = {};
  const fieldScores: { [key: string]: number } = {};

  // Score name field as primary label if it's in searchKeys
  if (choice.name && (searchKeys.includes('name') || searchKeys.includes('slicedName'))) {
    // Ensure name is a string
    const nameStr = typeof choice.name === 'string' ? choice.name : String(choice.name);

    // Check if this is a path
    const isPath = nameStr.includes('/') || nameStr.includes('\\');

    if (isPath) {
      // PATH-AWARE SCORING: Score filename separately from full path
      const basename = getBasename(nameStr);
      const basenameStartIndex = nameStr.length - basename.length;

      // Score the basename (filename) with higher weight
      const basenameAccessor = {
        getItemLabel: () => basename,
        getItemDescription: () => undefined,
        getItemPath: () => undefined,
      };

      const basenameScore = scoreItemFuzzy({ name: basename }, preparedQuery, true, basenameAccessor, {});

      // Score the full path with lower weight
      const fullPathAccessor = {
        getItemLabel: (item: any) => (typeof item.name === 'string' ? item.name : String(item.name)),
        getItemDescription: () => undefined,
        getItemPath: () => undefined,
      };

      const fullPathScore = scoreItemFuzzy(choice, preparedQuery, true, fullPathAccessor, {});

      // Determine best score and matches
      let bestScore = 0;
      let nameMatches: Array<[number, number]> | undefined;

      if (basenameScore && basenameScore.score > 0) {
        // Filename match - apply FILENAME_WEIGHT multiplier
        bestScore = basenameScore.score * 100 * SEARCH_CONFIG.FILENAME_WEIGHT;

        if (basenameScore.labelMatch?.length) {
          // Adjust match positions to full path coordinates
          nameMatches = basenameScore.labelMatch.map(
            (m) => [m.start + basenameStartIndex, m.end + basenameStartIndex] as [number, number],
          );
        }
      }

      if (fullPathScore && fullPathScore.score > 0) {
        // Check if full path score is better (for queries that span directories)
        const pathParts = nameStr.split(/[/\\]+/);
        let crossesComponents = false;

        // Check if matches cross component boundaries
        if (fullPathScore.labelMatch) {
          const componentBoundaries: number[] = [0];
          let pos = 0;
          for (let i = 0; i < pathParts.length - 1; i++) {
            pos += pathParts[i].length + 1;
            componentBoundaries.push(pos);
          }

          for (const match of fullPathScore.labelMatch) {
            for (const boundary of componentBoundaries) {
              if (match.start < boundary && match.end > boundary) {
                crossesComponents = true;
                break;
              }
            }
          }
        }

        // Apply penalty for matches that cross boundaries, but still consider if it's better
        const adjustedPathScore = crossesComponents ? fullPathScore.score * 50 : fullPathScore.score * 100;

        // Use path matches if they're better than basename matches
        if (adjustedPathScore > bestScore) {
          bestScore = adjustedPathScore;
          nameMatches = fullPathScore.labelMatch?.length ? convertMatches(fullPathScore.labelMatch) : undefined;
        }
      }

      if (bestScore > 0) {
        fieldScores.name = bestScore;
        totalScore += bestScore;

        if (nameMatches) {
          allMatches.name = nameMatches;

          // Handle slicedName
          if (choice.slicedName && choice.name !== choice.slicedName) {
            const sliceLength = choice.slicedName.length;
            const slicedMatches = nameMatches
              .filter(([start]) => start < sliceLength)
              .map(([start, end]) => [start, Math.min(end, sliceLength)] as [number, number]);
            if (slicedMatches.length > 0) {
              allMatches.slicedName = slicedMatches;
            }
          } else {
            allMatches.slicedName = nameMatches;
          }
        }
      }
    } else {
      // NON-PATH SCORING: Standard scoring for non-path names
      const nameAccessor = {
        getItemLabel: (item: any) => (typeof item.name === 'string' ? item.name : String(item.name)),
        getItemDescription: () => undefined,
        getItemPath: () => undefined,
      };

      const nameScore = scoreItemFuzzy(choice, preparedQuery, true, nameAccessor, {});
      if (nameScore && nameScore.score > 0) {
        const finalScore = nameScore.score * 100;
        fieldScores.name = finalScore;
        totalScore += finalScore;

        if (nameScore.labelMatch?.length) {
          const nameMatches = convertMatches(nameScore.labelMatch);
          if (nameMatches) {
            allMatches.name = nameMatches;

            // Handle slicedName
            if (choice.slicedName && choice.name !== choice.slicedName) {
              const sliceLength = choice.slicedName.length;
              const slicedMatches = nameScore.labelMatch
                .filter((m) => m.start < sliceLength)
                .map((m) => ({
                  start: m.start,
                  end: Math.min(m.end, sliceLength),
                }));
              if (slicedMatches.length > 0) {
                const slicedConverted = convertMatches(slicedMatches);
                if (slicedConverted) {
                  allMatches.slicedName = slicedConverted;
                }
              }
            } else if (nameMatches) {
              allMatches.slicedName = nameMatches;
            }
          }
        }
      }
    }
  }

  // Score description field - treat it as a label since VS Code scorer has issues with description-only matching
  if (choice.description && searchKeys.includes('description')) {
    const descAccessor = {
      getItemLabel: (item: any) => (typeof item.description === 'string' ? item.description : String(item.description)),
      getItemDescription: () => undefined,
      getItemPath: () => undefined,
    };

    const descScore = scoreItemFuzzy(choice, preparedQuery, true, descAccessor, {});
    if (descScore && descScore.score > 0 && descScore.labelMatch?.length) {
      const descriptionScore = descScore.score * 0.1; // Much lower priority for description matches
      totalScore += descriptionScore;
      fieldScores.description = descriptionScore;
      const descMatches = convertMatches(descScore.labelMatch); // Use labelMatch instead of descriptionMatch
      if (descMatches) {
        allMatches.description = descMatches;
      }
    }
  }

  // Score keyword field as a label
  if (choice.keyword && searchKeys.includes('keyword')) {
    const keywordAccessor = {
      getItemLabel: (item: any) => (typeof item.keyword === 'string' ? item.keyword : String(item.keyword)),
      getItemDescription: () => undefined,
      getItemPath: () => undefined,
    };

    const keywordScore = scoreItemFuzzy(choice, preparedQuery, true, keywordAccessor, {});
    if (keywordScore && keywordScore.score > 0) {
      const keywordFieldScore = keywordScore.score * 50; // High priority, but less than name
      totalScore += keywordFieldScore;
      fieldScores.keyword = keywordFieldScore;
      if (keywordScore.labelMatch?.length) {
        const kwMatches = convertMatches(keywordScore.labelMatch);
        if (kwMatches) {
          allMatches.keyword = kwMatches;
        }
      }
    }
  }

  // Score tag field as a label
  if (choice.tag && searchKeys.includes('tag')) {
    const tagAccessor = {
      getItemLabel: (item: any) => (typeof item.tag === 'string' ? item.tag : String(item.tag)),
      getItemDescription: () => undefined,
      getItemPath: () => undefined,
    };

    const tagScore = scoreItemFuzzy(choice, preparedQuery, true, tagAccessor, {});
    if (tagScore && tagScore.score > 0) {
      const tagFieldScore = tagScore.score * 1; // Low priority
      totalScore += tagFieldScore;
      fieldScores.tag = tagFieldScore;
      if (tagScore.labelMatch?.length) {
        const tagMatches = convertMatches(tagScore.labelMatch);
        if (tagMatches) {
          allMatches.tag = tagMatches;
        }
      }
    }
  }

  // Score any other custom fields that are in searchKeys
  const standardFields = ['name', 'slicedName', 'description', 'keyword', 'tag'];
  const customFields = searchKeys.filter((key) => !standardFields.includes(key));

  for (const fieldName of customFields) {
    const fieldValue = (choice as any)[fieldName];
    if (fieldValue && typeof fieldValue === 'string') {
      const customAccessor = {
        getItemLabel: (item: any) => (typeof item[fieldName] === 'string' ? item[fieldName] : String(item[fieldName])),
        getItemDescription: () => undefined,
        getItemPath: () => undefined,
      };

      const customScore = scoreItemFuzzy(choice, preparedQuery, true, customAccessor, {});
      if (customScore && customScore.score > 0) {
        const customFieldScore = customScore.score * 10; // Medium priority for custom fields
        totalScore += customFieldScore;
        fieldScores[fieldName] = customFieldScore;
        if (customScore.labelMatch?.length) {
          const customMatches = convertMatches(customScore.labelMatch);
          if (customMatches) {
            allMatches[fieldName] = customMatches;
          }
        }
      }
    }
  }

  // If no match at all, return null
  if (totalScore <= 0) {
    return null;
  }

  // Apply a minimum score threshold to filter out nonsensical matches
  // VS Code fuzzy scorer can return very low scores for poor matches
  // Lower threshold for description-only searches since description scores are weighted lower
  const hasOnlyDescriptionMatch = Object.keys(allMatches).length === 1 && allMatches.description;
  const MIN_SCORE_THRESHOLD = hasOnlyDescriptionMatch ? 10 : 100000; // Much lower threshold for description-only matches
  if (totalScore < MIN_SCORE_THRESHOLD) {
    return null;
  }

  // Find the best matching field
  let bestField = '';
  let bestFieldScore = 0;
  for (const [field, score] of Object.entries(fieldScores)) {
    if (score > bestFieldScore) {
      bestFieldScore = score;
      bestField = field;
    }
  }

  // Only keep matches for the best field
  const bestMatches: { [key: string]: Array<[number, number]> } = {};
  if (bestField && allMatches[bestField]) {
    bestMatches[bestField] = allMatches[bestField];
    // If name is the best match and we have slicedName, include it
    if (bestField === 'name' && allMatches.slicedName) {
      bestMatches.slicedName = allMatches.slicedName;
    }
  }

  const scoredChoice = createScoredChoice(choice);
  scoredChoice.score = totalScore;
  scoredChoice.matches = bestMatches;

  // Check for sequential word matching bonus
  if (choice.name) {
    const isSequential = isSequentialWordMatch(choice.name, allMatches.name || [], query);
    if (isSequential) {
      // Give significant bonus for sequential word matches
      scoredChoice.score *= 1.5;
      scoredChoice.isSequentialMatch = true;
    } else {
      scoredChoice.isSequentialMatch = false;
    }
  } else {
    scoredChoice.isSequentialMatch = false;
  }

  return scoredChoice;
}

/**
 * Search and score all choices with:
 * - Frecency-boosted scoring (frequency + recency)
 * - Path-aware scoring (filename matches weighted higher)
 * - Async cancellation support
 * - Result limiting
 */
export const searchChoices = (
  choices: Choice[],
  input: string,
  searchKeys: string[] = ['name', 'keyword', 'tag'],
  options: {
    applyFrecency?: boolean;
    maxResults?: number;
    searchId?: number;
  } = {},
) => {
  const {
    applyFrecency = false, // Disabled by default for backward compatibility
    maxResults = SEARCH_CONFIG.MAX_TOTAL_RESULTS,
    searchId,
  } = options;

  log.info(`searchChoices called with ${choices.length} choices and query "${input}"`);
  const results: ScoredChoice[] = [];

  // Handle empty query - return all non-hidden choices
  if (!input || input.trim() === '') {
    for (let i = 0; i < choices.length; i++) {
      const choice = choices[i];
      if (!choice.hideWithoutInput) {
        const scoredChoice = createScoredChoice(choice);
        scoredChoice.originalIndex = i;
        results.push(scoredChoice);
      }
    }
    log.info(`Empty query - returning ${results.length} results`);
    return results;
  }

  // Check for cancellation
  if (searchId !== undefined && !isSearchCurrent(searchId)) {
    log.info(`Search ${searchId} cancelled`);
    return [];
  }

  for (let i = 0; i < choices.length; i++) {
    const choice = choices[i];
    const scored = scoreChoice(choice, input, searchKeys);
    if (scored) {
      scored.originalIndex = i;
      results.push(scored);
    }
  }

  // Sort by score (highest first), then by original index as tiebreaker
  if (results.length > 0) {
    results.sort((a, b) => {
      const aIndex = a.originalIndex || 0;
      const bIndex = b.originalIndex || 0;

      // Check for sequential word matches
      const aIsSequential = a.isSequentialMatch || false;
      const bIsSequential = b.isSequentialMatch || false;

      // Sequential matches have highest priority
      if (aIsSequential && !bIsSequential) return -1;
      if (!aIsSequential && bIsSequential) return 1;

      // Check if both items start with the query
      const aStartsWith = a.item.name?.toLowerCase().startsWith(input.toLowerCase());
      const bStartsWith = b.item.name?.toLowerCase().startsWith(input.toLowerCase());

      // If both start with the query, sort by original index
      if (aStartsWith && bStartsWith) {
        return aIndex - bIndex;
      }

      // If only one starts with query, it wins
      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;

      // Otherwise, sort by score then by original index
      if (b.score === a.score) {
        return aIndex - bIndex;
      }
      return b.score - a.score;
    });
  }

  // Apply result limit
  const limitedResults = maxResults > 0 && results.length > maxResults ? results.slice(0, maxResults) : results;

  // Add truncation indicator if results were limited
  if (results.length > limitedResults.length) {
    const truncatedCount = results.length - limitedResults.length;
    log.info(`Results truncated: showing ${limitedResults.length} of ${results.length} (${truncatedCount} hidden)`);
  }

  log.info(`Returning ${limitedResults.length} scored results for query "${input}"`);
  return limitedResults;
};

/**
 * Async version of searchChoices that applies frecency scoring
 * Use this for main menu and file searches where frecency matters
 */
export const searchChoicesWithFrecency = async (
  choices: Choice[],
  input: string,
  searchKeys: string[] = ['name', 'keyword', 'tag'],
  options: {
    maxResults?: number;
    searchId?: number;
  } = {},
): Promise<ScoredChoice[]> => {
  const { maxResults = SEARCH_CONFIG.MAX_TOTAL_RESULTS, searchId } = options;

  log.info(`searchChoicesWithFrecency called with ${choices.length} choices and query "${input}"`);

  // Get base search results
  const results = searchChoices(choices, input, searchKeys, {
    applyFrecency: false,
    maxResults: 0, // Don't limit yet, we'll limit after frecency
    searchId,
  });

  // Check for cancellation
  if (searchId !== undefined && !isSearchCurrent(searchId)) {
    log.info(`Search ${searchId} cancelled before frecency`);
    return [];
  }

  // Early return for empty results or empty query
  if (results.length === 0 || !input || input.trim() === '') {
    return maxResults > 0 && results.length > maxResults ? results.slice(0, maxResults) : results;
  }

  // Get frecency scores for all results
  const choiceIds = results.map((r) => r.item.id).filter(Boolean);
  const frecencyScores = await getFrecencyScores(choiceIds);

  // Apply frecency boost to scores
  for (const result of results) {
    const frecencyMultiplier = frecencyScores.get(result.item.id) || 1.0;
    // Blend frecency with fuzzy score
    // Formula: finalScore = fuzzyScore * (1 + FRECENCY_WEIGHT * (frecencyMultiplier - 1))
    const frecencyBoost = 1 + SEARCH_CONFIG.FRECENCY_WEIGHT * (frecencyMultiplier - 1);
    result.score = result.score * frecencyBoost;
    result.frecencyBoost = frecencyMultiplier; // Store for debugging
  }

  // Re-sort with frecency-boosted scores
  results.sort((a, b) => {
    const aIndex = a.originalIndex || 0;
    const bIndex = b.originalIndex || 0;

    // Sequential matches still have highest priority
    const aIsSequential = a.isSequentialMatch || false;
    const bIsSequential = b.isSequentialMatch || false;
    if (aIsSequential && !bIsSequential) return -1;
    if (!aIsSequential && bIsSequential) return 1;

    // Starts-with matches still prioritized
    const aStartsWith = a.item.name?.toLowerCase().startsWith(input.toLowerCase());
    const bStartsWith = b.item.name?.toLowerCase().startsWith(input.toLowerCase());
    if (aStartsWith && bStartsWith) {
      // Both start with query - use frecency-boosted score
      if (b.score === a.score) return aIndex - bIndex;
      return b.score - a.score;
    }
    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;

    // Otherwise, sort by frecency-boosted score
    if (b.score === a.score) return aIndex - bIndex;
    return b.score - a.score;
  });

  // Apply result limit
  const limitedResults = maxResults > 0 && results.length > maxResults ? results.slice(0, maxResults) : results;

  log.info(`Returning ${limitedResults.length} frecency-boosted results for query "${input}"`);
  return limitedResults;
};

// Clear the cache (useful when choices change significantly)
export function clearFuzzyCache(): void {
  queryCache.clear();
}

// Check if a string matches exactly (for exact match detection)
export function isExactMatch(choice: Choice, query: string): boolean {
  const lowerQuery = query.toLowerCase();

  const nameStr = choice.name ? String(choice.name) : '';
  const keywordStr = choice.keyword ? String(choice.keyword) : '';
  const aliasStr = (choice as any).alias ? String((choice as any).alias) : '';
  const triggerStr = (choice as any).trigger ? String((choice as any).trigger) : '';

  return (
    nameStr.toLowerCase().startsWith(lowerQuery) ||
    keywordStr.toLowerCase().startsWith(lowerQuery) ||
    aliasStr.toLowerCase().startsWith(lowerQuery) ||
    triggerStr.toLowerCase().startsWith(lowerQuery)
  );
}

// Check if query matches as a mnemonic (first letters of words) or starts with any word
export function startsWithQuery(choice: Choice, query: string): boolean {
  const lowerQuery = query.toLowerCase();

  // Check if any word in the name starts with the query
  const nameStr = choice.name ? String(choice.name) : '';
  const nameWords = splitIntoWords(nameStr);
  const keywordStr = choice.keyword ? String(choice.keyword) : '';
  const keywordWords = splitIntoWords(keywordStr);

  const matchesWordStart =
    nameWords.some((word) => word.toLowerCase().startsWith(lowerQuery)) ||
    keywordWords.some((word) => word.toLowerCase().startsWith(lowerQuery));

  // Also check mnemonic matches
  const matchesMnemonic = isMnemonicMatch(nameStr, query) || isMnemonicMatch(keywordStr, query);

  return matchesWordStart || matchesMnemonic;
}
