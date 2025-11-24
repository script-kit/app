import { Channel, PROMPT, UI } from '@johnlindquist/kit/core/enum';
import type { Choice, FlagsWithKeys, Script } from '@johnlindquist/kit/types/core';

import {
  defaultGroupClassName,
  defaultGroupNameClassName,
  formatChoices,
  getMainScriptPath,
  groupChoices,
} from '@johnlindquist/kit/core/utils';
import { debounce } from 'lodash-es';

import { AppChannel } from '../shared/enums';
import type { ScoredChoice } from '../shared/types';
import { createScoredChoice, createAsTypedChoice, structuredClone } from './helpers';
import { searchLog as log, perf } from './logs';
import { cacheChoices } from './messages';
import type { KitPrompt } from './prompt';
import { kitCache, kitState } from './state';
import { searchChoices, scoreChoice, isExactMatch, startsWithQuery, clearFuzzyCache } from './vscode-search';


export const invokeSearch = (prompt: KitPrompt, rawInput: string, _reason = 'normal') => {
  const endPerfInvokeSearch = perf.start('invokeSearch', {
    input: rawInput,
    choiceCount: prompt.kitSearch.choices.length,
    reason: _reason,
  });

  if (prompt.ui !== UI.arg) {
    endPerfInvokeSearch();
    return;
  }

  // log.silly({ inputRegex: JSON.stringify(kitSearch.inputRegex) });
  let transformedInput = rawInput;
  if (prompt.kitSearch.inputRegex) {
    // eslint-disable-next-line no-param-reassign
    transformedInput = rawInput.match(prompt.kitSearch.inputRegex)?.[0] || '';
    log.silly(`Transformed input: ${transformedInput} using regex ${prompt.kitSearch.inputRegex}`);
  }

  if (prompt.kitSearch.choices.length === 0) {
    setScoredChoices(prompt, [], 'prompt.kitSearch.choices.length === 0');
    endPerfInvokeSearch();
    return;
  }

  // TODO: Add prompt.kitSearch.computedInput?
  // Should probably separate rawInput from the input that comes after the regex...
  prompt.kitSearch.input = transformedInput;
  prompt.flagSearch.input = '';
  // log.info({ transformedInput });
  const lowerCaseInput = transformedInput?.toLowerCase();

  // -------------------------------------------------------------
  //  OPTIONAL "AS TYPED" CANDIDATES
  //  Show only when we already have some results but none of them
  //  matches the input EXACTLY on any key we care about.
  //  AND only when there's an asTyped choice in the choices array.
  // -------------------------------------------------------------
  const generateAsTyped = (searchResult: ScoredChoice[] | undefined): ScoredChoice[] => {
    if (!transformedInput || transformedInput === '') return [];

    // Find ALL asTyped choices in the original choices
    const asTypedChoices = prompt.kitSearch.choices.filter(choice => choice?.asTyped === true);
    if (asTypedChoices.length === 0) return [];

    // Check if we should show the "As Typed" options
    const shouldShowAsTyped = !searchResult || searchResult.length === 0 || !searchResult.some(r => {
      const { name = '', keyword = '' } = r.item;
      return (
        name.toLowerCase() === lowerCaseInput ||
        keyword.toLowerCase() === lowerCaseInput
      );
    });

    if (!shouldShowAsTyped) return [];

    // Generate an "as typed" choice for each template
    return asTypedChoices.map(asTypedChoice =>
      createScoredChoice(createAsTypedChoice(transformedInput, asTypedChoice))
    );
  };

  if (transformedInput === '') {
    const results: ScoredChoice[] = [];
    for (const choice of prompt.kitSearch.choices) {
      if (!(choice?.miss || choice?.pass || choice?.hideWithoutInput)) {
        results.push(createScoredChoice(choice));
      }
    }

    if (results?.length === 0) {
      const misses: ScoredChoice[] = [];
      for (const choice of prompt.kitSearch.choices) {
        if (choice?.miss || choice?.info) {
          misses.push(createScoredChoice(choice));
        }
      }
      setScoredChoices(prompt, misses, 'transformedInput === "" && results.length === 0');
    } else {
      setScoredChoices(prompt, results, 'transformedInput === "" && results.length > 0');
    }

    endPerfInvokeSearch();
    return;
  }

  // Use dynamic search keys instead of hardcoded ones
  const searchKeys = prompt.kitSearch.keys || ['name', 'keyword', 'tag'];

  // Use VS Code fuzzy search with dynamic keys
  const result = searchChoices(prompt.kitSearch.choices, transformedInput, searchKeys);

  // Get result length, but filter out info and miss choices
  const resultLength = result.filter((r) => !(r?.item?.info || r?.item?.miss)).length;

  if (prompt.kitSearch.hasGroup) {
    // Build a map for constant time access
    const resultMap = new Map<string, ScoredChoice>();
    for (const r of result) {
      resultMap.set(r.item.id, r);
    }

    let groupedResults: ScoredChoice[] = [];
    const exactMatchGroup: ScoredChoice[] = [];
    const startsWithGroup: ScoredChoice[] = [];
    const otherMatchGroup: ScoredChoice[] = [];
    const infoGroup: ScoredChoice[] = [];
    const passGroup: ScoredChoice[] = [];
    const missGroup: ScoredChoice[] = [];
    const includedGroups = new Set<string>();
    let alias: Choice | undefined;

    // Process all choices and categorize them
    for (const choice of prompt.kitSearch.choices) {
      // Skip pass group headers - we'll create our own
      if (choice?.skip && choice?.name?.includes('Pass') && choice?.name?.includes('to...') && choice?.group?.includes('Pass')) {
        continue;
      }

      // Always include info choices
      if (choice?.info) {
        infoGroup.push(createScoredChoice(choice));
        continue;
      }

      // Check for exact alias/trigger match
      if ((choice as Script)?.alias === transformedInput || (choice as Script)?.trigger === transformedInput) {
        alias = structuredClone(choice);
        if (alias) {
          alias.pass = false;
          alias.group = choice?.trigger ? 'Trigger' : 'Alias';
          log.info(`${prompt.getLogPrefix()}: 🔔 Alias: ${alias.name} with group ${alias.group}`);
        }
        continue;
      }

      // Check if choice was matched by fuzzy search
      const scoredChoice = resultMap.get(choice.id);

      if (scoredChoice) {
        // Choice was matched by fuzzy search
        // Skip group separators - they should not be included in results
        if (choice?.skip) {
          continue;
        }

        if (choice.group) {
          includedGroups.add(choice.group);
        }

        if (isExactMatch(choice, transformedInput)) {
          exactMatchGroup.push(scoredChoice);
        } else if (startsWithQuery(choice, transformedInput)) {
          startsWithGroup.push(scoredChoice);
        } else {
          otherMatchGroup.push(scoredChoice);
        }
      } else {
        // Choice was not matched by fuzzy search
        const hide = choice?.hideWithoutInput && transformedInput === '';
        const miss = choice?.miss && !hide;

        if (miss) {
          missGroup.push(createScoredChoice(choice));
        } else if (!hide && choice?.pass) {
          // Check if pass choice matches
          let matches = false;

          if (typeof choice?.pass === 'string' && (choice?.pass as string).startsWith('/')) {
            const lastSlashIndex = choice?.pass.lastIndexOf('/');
            if (lastSlashIndex > 0) {
              const regexPatternWithFlags = choice?.pass;
              const regexPattern = regexPatternWithFlags.slice(1, lastSlashIndex);
              const flags = regexPatternWithFlags.slice(lastSlashIndex + 1);

              try {
                const regex = new RegExp(regexPattern, flags);
                matches = regex.test(transformedInput);
              } catch (e) {
                log.warn(`Invalid regex pattern: ${choice?.pass} for ${choice?.name}`);
              }
            }
          } else if (choice?.pass === true) {
            matches = true;
          }

          if (matches) {
            log.info(`Matched pass: ${choice?.pass} on ${choice?.name}`);
            passGroup.push(createScoredChoice(choice));
            if (choice.group) {
              includedGroups.add(choice.group);
            }
          }
        }
      }
    }

    // Combine results in priority order
    let combinedResults: ScoredChoice[] = [];

    // Add exact matches first with header
    if (exactMatchGroup.length > 0) {
      combinedResults.push(
        createScoredChoice({
          name: 'Exact Match',
          group: 'Match',
          pass: false,
          skip: true,
          nameClassName: defaultGroupNameClassName,
          className: defaultGroupClassName,
          height: PROMPT.ITEM.HEIGHT.XXXS,
          id: Math.random().toString(),
        })
      );
      // Sort exact matches by original index (they're all exact matches)
      exactMatchGroup.sort((a, b) => {
        const aIndex = a.originalIndex || 0;
        const bIndex = b.originalIndex || 0;
        return aIndex - bIndex;
      });
      combinedResults.push(...exactMatchGroup);
    }

    // Add starts with matches (already sorted by VS Code algorithm)
    if (startsWithGroup.length > 0) {
      if (exactMatchGroup.length === 0) {
        // Only add header if we didn't already add exact match header
        combinedResults.push(
          createScoredChoice({
            name: 'Best Matches',
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
      // Sort startsWith matches by original index (they all start with the query)
      startsWithGroup.sort((a, b) => {
        const aIndex = a.originalIndex || 0;
        const bIndex = b.originalIndex || 0;
        return aIndex - bIndex;
      });
      combinedResults.push(...startsWithGroup);
    }

    // Add other matches with Fuzzy Match header
    if (otherMatchGroup.length > 0) {
      // Add Fuzzy Match header
      combinedResults.push(
        createScoredChoice({
          name: 'Fuzzy Match',
          group: 'Match',
          pass: false,
          skip: true,
          nameClassName: defaultGroupNameClassName,
          className: defaultGroupClassName,
          height: PROMPT.ITEM.HEIGHT.XXXS,
          id: Math.random().toString(),
        })
      );

      // Sort by score, then by original index
      otherMatchGroup.sort((a, b) => {
        if (b.score === a.score) {
          const aIndex = a.originalIndex || 0;
          const bIndex = b.originalIndex || 0;
          return aIndex - bIndex;
        }
        return b.score - a.score;
      });
      combinedResults.push(...otherMatchGroup);
    }

    // Add pass group with single header
    if (passGroup.length > 0) {
      // Add single "Pass" header with dynamic text
      combinedResults.push(
        createScoredChoice({
          name: `Pass "${transformedInput}" to...`,
          group: 'Pass',
          pass: false,
          skip: true,
          nameClassName: defaultGroupNameClassName,
          className: defaultGroupClassName,
          height: PROMPT.ITEM.HEIGHT.XXXS,
          id: Math.random().toString(),
        })
      );
      combinedResults.push(...passGroup);
    }

    // If no matches, show miss group
    if (combinedResults.length === 0 && result.length === 0) {
      combinedResults = missGroup;
    }

    // Add alias if found
    if (alias) {
      combinedResults.unshift(
        createScoredChoice({
          name: alias.group || 'Alias',
          group: alias.group || 'Alias',
          pass: false,
          skip: true,
          nameClassName: defaultGroupNameClassName,
          className: defaultGroupClassName,
          height: PROMPT.ITEM.HEIGHT.XXXS,
          id: Math.random().toString(),
        }),
        createScoredChoice(alias),
      );
    }

    // Always show info items at the top
    combinedResults.unshift(...infoGroup);

    // Add "as typed" options if applicable
    const asTypedChoices = generateAsTyped(result);
    combinedResults.push(...asTypedChoices);

    setScoredChoices(prompt, combinedResults, 'prompt.kitSearch.hasGroup');
    endPerfInvokeSearch();
  } else if (resultLength === 0) {
    // VS Code fuzzy search returned no results, show miss/info choices
    const fallbackResults: ScoredChoice[] = [];

    for (const choice of prompt.kitSearch.choices) {
      if (choice?.miss || choice?.info || choice?.pass) {
        fallbackResults.push(createScoredChoice(choice));
      }
    }

    const asTypedChoices = generateAsTyped(result);
    fallbackResults.push(...asTypedChoices);

    setScoredChoices(prompt, fallbackResults, 'resultLength === 0');
    endPerfInvokeSearch();
  } else {
    // Non-grouped results - already sorted by VS Code algorithm
    const infoChoices = result.filter(r => r.item.info);
    const normalChoices = result.filter(r => !r.item.info && !r.item.miss && !r.item.skip);
    const missChoices = result.filter(r => r.item.miss);

    // Check for pass choices that match regex patterns
    const passChoices: ScoredChoice[] = [];
    for (const choice of prompt.kitSearch.choices) {
      if (choice?.pass && !result.some(r => r.item.id === choice.id)) {
        if (typeof choice?.pass === 'string' && (choice?.pass as string).startsWith('/')) {
          const lastSlashIndex = choice?.pass.lastIndexOf('/');
          if (lastSlashIndex > 0) {
            const regexPatternWithFlags = choice?.pass;
            const regexPattern = regexPatternWithFlags.slice(1, lastSlashIndex);
            const flags = lastSlashIndex === -1 ? '' : regexPatternWithFlags.slice(lastSlashIndex + 1);
            try {
              const regex = new RegExp(regexPattern, flags);
              if (regex.test(transformedInput)) {
                passChoices.push(createScoredChoice(choice));
              }
            } catch (e) {
              log.warn(`Invalid regex pattern: ${choice?.pass} for ${choice?.name}`);
            }
          }
        } else if (choice?.pass === true) {
          passChoices.push(createScoredChoice(choice));
        }
      }
    }

    // Combine: info first, then normal results, then pass choices, then miss choices
    const combinedResults = [...infoChoices, ...normalChoices, ...passChoices, ...missChoices];

    const asTypedChoices = generateAsTyped(result);
    combinedResults.push(...asTypedChoices);

    setScoredChoices(prompt, combinedResults, 'resultLength > 0');
    endPerfInvokeSearch();
  }
};


export const debounceInvokeSearch = debounce(invokeSearch, 100);

export const invokeFlagSearch = (prompt: KitPrompt, input: string) => {
  prompt.flagSearch.input = input;

  if (input === '') {
    setScoredFlags(
      prompt,
      prompt.flagSearch.choices.filter((c) => !(c?.pass || c?.hideWithoutInput || c?.miss)).map(createScoredChoice),
    );
    return;
  }

  // Use VS Code fuzzy search with default keys for flag search
  const result = searchChoices(prompt.flagSearch.choices, input);

  if (prompt.flagSearch.hasGroup) {
    // Build a map for quick lookup
    const resultMap = new Map<string, ScoredChoice>();
    for (const r of result) {
      resultMap.set(r.item.id, r);
    }

    const exactMatchGroup: ScoredChoice[] = [];
    const startsWithGroup: ScoredChoice[] = [];
    const otherMatchGroup: ScoredChoice[] = [];
    const missGroup: ScoredChoice[] = [];

    // Categorize results
    for (const scoredChoice of result) {
      if (scoredChoice.item.miss) {
        missGroup.push(scoredChoice);
      } else if (isExactMatch(scoredChoice.item, prompt.flagSearch.input)) {
        exactMatchGroup.push(scoredChoice);
      } else if (startsWithQuery(scoredChoice.item, prompt.flagSearch.input || '')) {
        startsWithGroup.push(scoredChoice);
      } else {
        otherMatchGroup.push(scoredChoice);
      }
    }

    // Build final results
    let groupedResults: ScoredChoice[] = [];

    // Add exact matches with header
    if (exactMatchGroup.length > 0) {
      groupedResults.push(
        createScoredChoice({
          name: 'Exact Match',
          group: 'Match',
          pass: false,
          skip: true,
          nameClassName: defaultGroupNameClassName,
          className: defaultGroupClassName,
          height: PROMPT.ITEM.HEIGHT.XXXS,
          id: Math.random().toString(),
        }),
        ...exactMatchGroup
      );
    }

    // Add other matches
    groupedResults.push(...startsWithGroup, ...otherMatchGroup);

    // Show miss group if no matches
    if (groupedResults.length === 0) {
      groupedResults = missGroup;
    }

    setScoredFlags(prompt, groupedResults);
  } else if (result.length === 0) {
    // No matches, show miss choices
    const missGroup = prompt.flagSearch.choices
      .filter(c => c?.miss)
      .map(createScoredChoice);
    setScoredFlags(prompt, missGroup);
  } else {
    // Non-grouped results - already sorted by VS Code algorithm
    setScoredFlags(prompt, result);
  }
};

export const setFlags = (prompt: KitPrompt, f: FlagsWithKeys & Partial<Choice>) => {
  log.info(`${prompt.getLogPrefix()}: 🔥 Setting flags: ${Object.keys(f)}`);
  const order = f?.order || [];
  const sortChoicesKey = f?.sortChoicesKey || [];

  // TODO: Think through type conversion here
  let flagChoices: Choice[] = [];
  for (const [key, value] of Object.entries(f)) {
    if (key !== 'order' && key !== 'sortChoicesKey') {
      flagChoices.push({
        ...(value as Choice),
        id: key,
        group: value?.group,
        name: value?.name || key,
        shortcut: value?.shortcut || '',
        tag: value?.tag || value?.shortcut || '',
        description: value?.description || '',
        value: key,
        preview: value?.preview || '',
      });
    }
  }

  if (flagChoices.find((c: Choice) => c?.group)) {
    flagChoices = groupChoices(flagChoices, {
      order,
      sortChoicesKey,
    });
  }

  const choices = formatChoices(flagChoices);

  prompt.flagSearch.choices = choices;
  prompt.flagSearch.hasGroup = Boolean(choices?.find((c: Choice) => c?.group));

  // Clear fuzzy cache when flag choices change
  clearFuzzyCache();

  log.info(`${prompt.getLogPrefix()}: Flag choices: ${choices.length}`);
  invokeFlagSearch(prompt, prompt.flagSearch.input);
};

export const setShortcodes = (prompt: KitPrompt, choices: Choice[]) => {
  prompt.kitSearch.shortcodes.clear();
  prompt.kitSearch.triggers.clear();
  prompt.kitSearch.postfixes.clear();

  for (const choice of choices) {
    const code = (choice?.shortcode || '').toLowerCase();

    if (code) {
      prompt.kitSearch.shortcodes.set(code, choice);
    }

    if (choice?.keyword) {
      // log.info(`🗝 Found keyword ${choice.keyword}`);
      prompt.kitSearch.keywords.set(choice.keyword.toLowerCase(), choice);
    }

    // TODO: Parse choice.trigger earlier during choice formatting?
    const trigger = (choice?.trigger || choice?.name?.match(/(?<=\[)\w+(?=\])/i)?.[0] || '').toLowerCase();

    if (trigger) {
      log.info(`${prompt.getLogPrefix()}: 🔔 Setting trigger: ${trigger} to ${choice.name}`);
      prompt.kitSearch.triggers.set(trigger, choice);
    }

    const postfix = typeof choice?.pass === 'string' && !(choice?.pass as string).startsWith('/');

    if (postfix && typeof choice.pass === 'string') {
      prompt.kitSearch.postfixes.set(choice.pass.trim(), choice);
    }
  }

  prompt.updateShortcodes();

  // Log the keywords and shortcodes
  log.info(
    `${prompt.getLogPrefix()}: Short stats: 🗝 ${prompt.kitSearch.keywords.size} keywords, ${prompt.kitSearch.shortcodes.size} shortcodes, ${prompt.kitSearch.postfixes.size} postfixes, ${prompt.kitSearch.triggers.size} triggers`,
  );
};

export const appendChoices = (prompt: KitPrompt, choices: Choice[]) => {
  setChoices(prompt, prompt.kitSearch.choices.concat(choices), {
    preload: false,
  });
};

export const setChoices = (
  prompt: KitPrompt,
  choices: Choice[],
  { preload, skipInitialSearch, generated }: { preload: boolean; skipInitialSearch?: boolean; generated?: boolean },
) => {
  log.info(`${prompt.getLogPrefix()}: setChoices:`, {
    input: prompt.kitSearch.input,
    isArray: Array.isArray(choices),
    length: choices?.length,
    preload,
    skipInitialSearch,
    generated,
  });
  const sendToPrompt = prompt.sendToPrompt;
  sendToPrompt(
    Channel.SET_SELECTED_CHOICES,
    (choices || []).filter((c: Choice) => c?.selected),
  );

  if (prompt.cacheScriptChoices) {
    log.info(`${prompt.getLogPrefix()}: Caching script choices for ${prompt.scriptPath}: ${choices.length}`);
    // TODO: Sync up the kitCache.choices approach with this older approach
    cacheChoices(prompt.scriptPath, choices);
    prompt.cacheScriptChoices = false;
  } else if (prompt?.scriptPath && choices?.length > 0) {
    log.info(`${prompt.getLogPrefix()}: Not caching script choices for ${prompt.scriptPath}: ${choices.length}`);
  }

  if (!(choices && Array.isArray(choices)) || choices?.length === 0) {
    prompt.kitSearch.choices = [];
    setScoredChoices(prompt, [], '!choices || !Array.isArray(choices) || choices.length === 0');
    prompt.kitSearch.hasGroup = false;
    return;
  }

  const scoredChoices = choices.map(createScoredChoice);
  if (generated) {
    setScoredChoices(prompt, scoredChoices, 'generated');
    return;
  }

  if (prompt.isMainMenu) {
    log.info(`${prompt.getLogPrefix()}: 💝 Caching main menu choices. First script: ${scoredChoices?.[1]?.item?.name}`);
    kitCache.choices = scoredChoices;
  }

  prompt.kitSearch.choices = choices.filter((c) => !c?.exclude);
  prompt.kitSearch.hasGroup = Boolean(choices?.find((c: Choice) => c?.group));

  // Clear fuzzy cache when choices change
  clearFuzzyCache();

  sendToPrompt(Channel.SET_CHOICES_CONFIG, { preload });

  setShortcodes(prompt, choices);
  const input = skipInitialSearch ? '' : prompt.kitSearch.input;
  log.silly({
    preload: preload ? 'true' : 'false',
    skipInitialSearch: skipInitialSearch ? 'true' : 'false',
  });
  invokeSearch(prompt, input, 'setChoices');
};

export const setScoredChoices = (prompt: KitPrompt, choices: ScoredChoice[], reason = 'default') => {
  const endPerfSetScoredChoices = perf.start('setScoredChoices', {
    choiceCount: choices.length,
    reason,
  });

  log.verbose(`${prompt.pid}: ${reason} 🎼 Scored choices count: ${choices.length}`);

  const sendToPrompt = prompt.sendToPrompt;
  sendToPrompt(Channel.SET_SCORED_CHOICES, choices);

  if (
    prompt.isMainMenu &&
    prompt.kitSearch.input === '' &&
    !prompt.kitSearch.inputRegex &&
    choices?.length > 0
  ) {
    log.info(
      `${prompt.getLogPrefix()}: Caching main scored choices: ${choices.length}. First choice: ${choices[0]?.item?.name}`,
    );
    sendToPrompt(AppChannel.SET_CACHED_MAIN_SCORED_CHOICES, choices);
  }

  endPerfSetScoredChoices();
};

export const setScoredFlags = (prompt: KitPrompt, choices: ScoredChoice[] = []) => {
  log.silly(`${prompt.getLogPrefix()}: 🎼 Scored flags count: ${choices.length}`);
  prompt.sendToPrompt(Channel.SET_SCORED_FLAGS, choices);
};
