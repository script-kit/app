import type { Choice } from '@johnlindquist/kit/types/core';
import type { IMatch, IItemScore } from 'vscode-fuzzy-scorer';
import { scoreItemFuzzy, prepareQuery, compareItemsByFuzzyScore } from 'vscode-fuzzy-scorer';
import { searchLog as log } from './logs';
import type { ScoredChoice } from '../shared/types';
import { createScoredChoice } from './helpers';

// Cache for prepared queries
const queryCache = new Map<string, any>();

// Convert IMatch array to our expected format
function convertMatches(matches: IMatch[] | undefined): Array<[number, number]> | undefined {
  if (!matches || matches.length === 0) return undefined;
  return matches.map(m => [m.start, m.end]);
}

// Split text by both spaces and path separators
function splitIntoWords(text: string): string[] {
  // Split by spaces, forward slashes, and backslashes
  return text.split(/[\s\/\\]+/).filter(w => w.length > 0);
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
  const parts = text.split(/([\s\/\\]+)/);
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part && !/^[\s\/\\]+$/.test(part)) {
      // This is a word, not a separator
      words.push({
        text: part,
        start: position,
        end: position + part.length
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

// Score a single choice against a query with independent field matching
export function scoreChoice(choice: Choice, query: string): ScoredChoice | null {
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

  // Score name field as primary label
  if (choice.name) {
    // Always use the full string for scoring first
    const nameAccessor = {
      getItemLabel: (item: any) => item.name,
      getItemDescription: () => undefined,
      getItemPath: () => undefined
    };
    
    const nameScore = scoreItemFuzzy(choice, preparedQuery, true, nameAccessor, {});
    if (nameScore && nameScore.score > 0) {
      // For paths, apply a penalty if matches are scattered across path separators
      const isPath = choice.name.includes('/') || choice.name.includes('\\');
      
      if (isPath && nameScore.labelMatch) {
        // Check if matches span multiple path components without being at word boundaries
        const pathParts = choice.name.split(/[\/\\]+/);
        let componentBoundaries: number[] = [0];
        let pos = 0;
        
        // Calculate component boundaries
        for (let i = 0; i < pathParts.length - 1; i++) {
          pos += pathParts[i].length + 1; // +1 for separator
          componentBoundaries.push(pos);
        }
        
        // Check if matches respect component boundaries
        let crossesComponents = false;
        for (const match of nameScore.labelMatch) {
          // Check if this match starts at a component boundary
          const startsAtBoundary = componentBoundaries.some(b => b === match.start);
          
          // Check if match spans across components
          for (const boundary of componentBoundaries) {
            if (match.start < boundary && match.end > boundary) {
              crossesComponents = true;
              break;
            }
          }
        }
        
        // Apply penalty for matches that cross component boundaries
        if (crossesComponents) {
          totalScore += nameScore.score * 50; // Reduced weight for scattered matches
        } else {
          totalScore += nameScore.score * 100; // Full weight for clean matches
        }
      } else {
        totalScore += nameScore.score * 100; // Normal weight for non-paths
      }
      
      if (nameScore.labelMatch?.length) {
        allMatches.name = convertMatches(nameScore.labelMatch);
        
        // Handle slicedName
        if (choice.slicedName && choice.name !== choice.slicedName) {
          const sliceLength = choice.slicedName.length;
          const slicedMatches = nameScore.labelMatch
            .filter(m => m.start < sliceLength)
            .map(m => ({
              start: m.start,
              end: Math.min(m.end, sliceLength)
            }));
          if (slicedMatches.length > 0) {
            allMatches.slicedName = convertMatches(slicedMatches);
          }
        } else {
          allMatches.slicedName = convertMatches(nameScore.labelMatch);
        }
      }
    }
  }

  // Score description field (requires a label to work properly in VS Code scorer)
  if (choice.description) {
    const descAccessor = {
      getItemLabel: () => 'dummy', // VS Code scorer needs a non-empty label
      getItemDescription: (item: any) => item.description,
      getItemPath: () => undefined
    };
    
    const descScore = scoreItemFuzzy(choice, preparedQuery, true, descAccessor, {});
    if (descScore && descScore.score > 0 && descScore.descriptionMatch?.length) {
      totalScore += descScore.score * 0.1; // Much lower priority for description matches
      allMatches.description = convertMatches(descScore.descriptionMatch);
    }
  }

  // Score keyword field as a label
  if (choice.keyword) {
    const keywordAccessor = {
      getItemLabel: (item: any) => item.keyword,
      getItemDescription: () => undefined,
      getItemPath: () => undefined
    };
    
    const keywordScore = scoreItemFuzzy(choice, preparedQuery, true, keywordAccessor, {});
    if (keywordScore && keywordScore.score > 0) {
      totalScore += keywordScore.score * 50; // High priority, but less than name
      if (keywordScore.labelMatch?.length) {
        allMatches.keyword = convertMatches(keywordScore.labelMatch);
      }
    }
  }

  // Score tag field as a label
  if (choice.tag) {
    const tagAccessor = {
      getItemLabel: (item: any) => item.tag,
      getItemDescription: () => undefined,
      getItemPath: () => undefined
    };
    
    const tagScore = scoreItemFuzzy(choice, preparedQuery, true, tagAccessor, {});
    if (tagScore && tagScore.score > 0) {
      totalScore += tagScore.score * 1; // Low priority
      if (tagScore.labelMatch?.length) {
        allMatches.tag = convertMatches(tagScore.labelMatch);
      }
    }
  }

  // If no match at all, return null
  if (totalScore <= 0) {
    return null;
  }

  const scoredChoice = createScoredChoice(choice);
  scoredChoice.score = totalScore;
  scoredChoice.matches = allMatches;
  
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
  }

  return scoredChoice;
}

// Search and score all choices
export function searchChoices(choices: Choice[], query: string): ScoredChoice[] {
  log.info(`searchChoices called with ${choices.length} choices and query "${query}"`);
  const results: ScoredChoice[] = [];

  // Handle empty query - return all non-hidden choices
  if (!query || query.trim() === '') {
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

  for (let i = 0; i < choices.length; i++) {
    const choice = choices[i];
    const scored = scoreChoice(choice, query);
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
      const aStartsWith = a.item.name?.toLowerCase().startsWith(query.toLowerCase());
      const bStartsWith = b.item.name?.toLowerCase().startsWith(query.toLowerCase());
      
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