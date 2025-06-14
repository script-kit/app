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

import { QuickScore, createConfig } from 'quick-score';
import { AppChannel } from '../shared/enums';
import type { ScoredChoice } from '../shared/types';
import { createScoredChoice } from './helpers';
import { searchLog as log } from './logs';
import { cacheChoices } from './messages';
import type { KitPrompt } from './prompt';
import { kitCache, kitState } from './state';
import { normalizeWithMap, remapRange } from './utils/normalize-map';

/** Fix every RangeTuple inside a QuickScore result */
function fixHighlightRanges<T extends ScoredChoice>(sc: T): T {
  // QuickScore could have matches on multiple keys; walk them all.
  for (const key in sc.matches) {
    const raw = (sc.item as any)[key] as string;
    if (!raw) continue;
    // Trigger the cache in case we never normalised this exact raw string (rare)
    normalizeWithMap(raw);
    sc.matches[key] = sc.matches[key].map(r => remapRange(raw, r));
  }
  return sc;
}

export const invokeSearch = (prompt: KitPrompt, rawInput: string, _reason = 'normal') => {
  // log.info(`${prompt.pid}: ${reason}: Invoke search: '${rawInput}'`);

  if (prompt.ui !== UI.arg) {
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
    return;
  }

  // TODO: Add prompt.kitSearch.computedInput?
  // Should probably separate rawInput from the input that comes after the regex...
  prompt.kitSearch.input = transformedInput;
  prompt.flagSearch.input = '';
  // log.info({ transformedInput });
  const lowerCaseInput = transformedInput?.toLowerCase();

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

    return;
  }

  if (!prompt.kitSearch.qs) {
    log.warn(`No qs for ${prompt.scriptPath}`);
    return;
  }
  const rawResult = (prompt.kitSearch?.qs as QuickScore<Choice>)?.search(transformedInput);
  const result = rawResult?.map((sc) => fixHighlightRanges(sc as ScoredChoice)) as ScoredChoice[];

  // Get result length, but filter out info and miss choices
  const resultLength = result.filter((r) => !(r?.item?.info || r?.item?.miss)).length;

  if (prompt.kitSearch.hasGroup) {
    // Build a map for constant time access
    const resultMap = new Map();
    const keepGroups = new Set();
    const removeGroups = new Map<string, { count: number; index: number }>();
    for (const r of result) {
      resultMap.set(r.item.id, r);
      keepGroups.add(r.item.group);
      removeGroups.set(r.item.group as string, {
        count: 0,
        index: 0,
      });
    }

    keepGroups.add('Pass');

    let groupedResults: ScoredChoice[] = [];

    const infoGroup: ScoredChoice[] = [];
    const startsWithGroup: ScoredChoice[] = [];
    const includesGroup: ScoredChoice[] = [];
    const matchLastGroup: ScoredChoice[] = [];
    const missGroup: ScoredChoice[] = [];
    let alias: Choice;

    for (const choice of prompt.kitSearch.choices) {
      const lowerCaseName = choice.name?.toLowerCase();
      const lowerCaseKeyword = choice.keyword?.toLowerCase() || choice?.tag?.toLowerCase() || '';
      if (choice?.info) {
        infoGroup.push(createScoredChoice(choice));
      } else if ((choice as Script)?.alias === transformedInput || (choice as Script)?.trigger === transformedInput) {
        alias = structuredClone(choice);
        alias.pass = false;
        alias.group = choice?.trigger ? 'Trigger' : 'Alias';
        log.info(`${prompt.getLogPrefix()}: 🔔 Alias: ${alias.name} with group ${alias.group}`);
      } else if (
        !(choice?.skip || choice?.miss) &&
        (lowerCaseName?.includes(lowerCaseInput) || lowerCaseKeyword.includes(lowerCaseInput))
      ) {
        const scoredChoice = resultMap.get(choice.id);
        if (scoredChoice && !scoredChoice?.item?.lastGroup) {
          const c = structuredClone(scoredChoice);
          c.item.tag ||= c?.item?.kenv || c?.item?.group === 'Pass' ? '' : c?.item?.group;
          // This was breaking the choice.preview lookup in the SDK
          // c.item.id = Math.random();
          c.item.pass = false;
          c.item.exact = true;
          if (lowerCaseName.startsWith(lowerCaseInput) || scoredChoice?.item?.keyword?.startsWith(lowerCaseInput)) {
            startsWithGroup.push(c);
          } else {
            includesGroup.push(c);
          }
        } else if (scoredChoice?.item?.lastGroup) {
          const c = structuredClone(scoredChoice);
          c.item.tag = c?.item?.kenv || c?.item?.group === 'Pass' ? '' : c?.item?.group;
          // This was breaking the choice.preview lookup in the SDK
          // c.item.id = Math.random();
          c.item.pass = false;
          // log.info(`Found match last: ${c?.item?.name}`);
          matchLastGroup.push(c);
        }

        // Aggressive search everything
        // else {
        //   const start = choice?.name?.toLowerCase()?.indexOf(lowerCaseInput);

        //   if (start > -1) {
        //     const end = start + lowerCaseInput.length;
        //     log.info({ start, end });
        //     const scoredChoice = createScoredChoice(choice);
        //     scoredChoice.matches = {
        //       slicedName: [[start, end]],
        //       name: [[start, end]],
        //     };
        //     scoredChoice.score = 0.5;
        //     includesGroup.push(scoredChoice);
        //     // TODO
        //   }
        // }
      } else {
        const hide = choice?.hideWithoutInput && transformedInput === '';
        const miss = choice?.miss && !hide;
        const choiceInfo = choice?.info && !hide;
        if (choiceInfo) {
          infoGroup.push(createScoredChoice(choice));
        } else if (miss) {
          missGroup.push(createScoredChoice(choice));
        } else if (!hide) {
          const scoredChoice = resultMap.get(choice.id);
          if (choice?.pass) {
            if (typeof choice?.pass === 'string' && (choice?.pass as string).startsWith('/')) {
              // log.info(`Found regex pass: ${choice?.pass} on ${choice?.name}`);
              const lastSlashIndex = choice?.pass.lastIndexOf('/');
              if (lastSlashIndex) {
                const regexPatternWithFlags = choice?.pass;
                const regexPattern = regexPatternWithFlags.slice(1, lastSlashIndex);
                const flags = lastSlashIndex === -1 ? '' : regexPatternWithFlags.slice(lastSlashIndex + 1);

                const regex = new RegExp(regexPattern, flags);

                // log.info(
                //   `Using regex pattern: ${regexPattern} with flags: ${flags}`,
                // );
                const result = regex.test(transformedInput);

                if (result) {
                  log.info(`Matched regex pass: ${choice?.pass} on ${choice?.name}`);
                  groupedResults.push(createScoredChoice(choice));
                }
              } else {
                log.warn(`No terminating slashes found in regex pattern: ${choice?.pass} for ${choice?.name}`);
              }
            } else {
              groupedResults.push(createScoredChoice(choice));
            }
          } else if (scoredChoice?.item?.lastGroup) {
            const c = structuredClone(scoredChoice);
            matchLastGroup.push(c);
          } else if (scoredChoice) {
            groupedResults.push(scoredChoice);
            const removeGroup = removeGroups.get(scoredChoice?.item?.group);
            if (removeGroup) {
              if (scoredChoice?.item?.skip && removeGroup.index === 0) {
                removeGroup.index = groupedResults.length - 1;
              } else {
                removeGroup.count += 1;
              }
            }
          } else if (choice?.skip && keepGroups?.has(choice?.group)) {
            const removeGroup = removeGroups.get(choice?.group as string);

            groupedResults.push(createScoredChoice(choice));
            if (removeGroup && removeGroup.index === 0) {
              removeGroup.index = groupedResults.length - 1;
            }
          }
        }
      }
    }

    removeGroups.delete('Pass');

    // loop through removeGroups and remove groups that have no results
    // Sort removeGroups by index in descending order
    const sortedRemoveGroups = Array.from(removeGroups).sort((a, b) => b[1].index - a[1].index);
    for (const [group, { count, index }] of sortedRemoveGroups) {
      // log.info(`Group ${group} has ${count} results at ${index}`);
      // log.info(`The item at ${index} is ${groupedResults[index]?.item?.name}`);
      if (count === 0) {
        // log.info(
        //   `🗑 ${group} with no results. Removing ${groupedResults[index].item.name}`
        // );
        groupedResults.splice(index, 1);
      }
    }

    if (startsWithGroup.length > 0) {
      startsWithGroup.sort((a, b) => {
        const aKeyword = a?.item?.keyword;
        const bKeyword = b?.item?.keyword;

        if (aKeyword === lowerCaseInput) {
          return -1;
        }
        if (bKeyword === lowerCaseInput) {
          return 1;
        }
        if (aKeyword && !bKeyword) {
          return -1;
        }
        if (!aKeyword && bKeyword) {
          return 1;
        }
        if (aKeyword && bKeyword) {
          return aKeyword.length - bKeyword.length;
        }

        return 0;
      });
    }

    if (startsWithGroup.length > 0 || includesGroup?.length > 0) {
      startsWithGroup.unshift(
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
      );

      startsWithGroup.push(...includesGroup);
      groupedResults.unshift(...startsWithGroup);
    }

    if (matchLastGroup.length > 0) {
      matchLastGroup.sort((a, b) => {
        if (a?.item?.keyword && !b?.item?.keyword) {
          return -1;
        }
        if (!a?.item?.keyword && b?.item?.keyword) {
          return 1;
        }

        return 0;
      });
      matchLastGroup.unshift(
        createScoredChoice({
          name: matchLastGroup[0]?.item?.group || 'Last Match',
          group: matchLastGroup[0]?.item?.group || 'Last Match',
          pass: false,
          skip: true,
          nameClassName: defaultGroupNameClassName,
          className: defaultGroupClassName,
          height: PROMPT.ITEM.HEIGHT.XXXS,
          id: Math.random().toString(),
        }),
      );
      groupedResults.push(...matchLastGroup);
    }

    if (groupedResults.length === 0) {
      groupedResults = missGroup;
    }

    if (alias) {
      groupedResults.unshift(
        createScoredChoice({
          name: alias.group,
          group: alias.group,
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

    groupedResults.unshift(...infoGroup);

    setScoredChoices(prompt, groupedResults, 'prompt.kitSearch.hasGroup');
  } else if (resultLength === 0) {
    const filteredResults: ScoredChoice[] = [];
    let hasChoice = false;
    for (const choice of prompt.kitSearch.choices) {
      if (choice?.miss) {
        filteredResults.push(createScoredChoice(choice));
        continue;
      }
      if (choice?.pass) {
        filteredResults.push(createScoredChoice(choice));
        continue;
      }
      if (choice?.info) {
        filteredResults.push(createScoredChoice(choice));
        continue;
      }
      for (const key of prompt.kitSearch.keys) {
        let start = -1;

        const value = (choice as any)?.[key];
        if (typeof value === 'string' && value.trim()) {
          start = value?.toLowerCase()?.indexOf(lowerCaseInput);
        }

        if (start > -1) {
          const end = start + lowerCaseInput.length;
          const scoredChoice = createScoredChoice(choice);
          scoredChoice.matches = {
            [key]: [[start, end]],
          };
          scoredChoice.score = 1;
          filteredResults.push(scoredChoice);
          hasChoice = true;
          break;
        }
      }
    }

    const scoredChoices = filterAndSortOtherChoices(filteredResults, transformedInput, lowerCaseInput, hasChoice);

    setScoredChoices(prompt, scoredChoices, 'resultLength === 0');
  } else {
    const allMisses = result.every((r) => r?.item?.miss && r?.item?.info);
    if (allMisses) {
      setScoredChoices(prompt, result, 'allMisses');
    } else {
      const filteredResults: ScoredChoice[] = [];
      let hasChoice = false;
      for (const choice of result) {
        if (choice?.item?.miss) {
          filteredResults.push(choice);
          continue;
        }
        if (choice?.item?.pass) {
          filteredResults.push(choice);
          continue;
        }
        if (choice?.item?.info) {
          filteredResults.push(choice);
          continue;
        }

        hasChoice = true;
        filteredResults.push(choice);
        log.info(`${prompt.getLogPrefix()}: hasChoice ${choice?.item?.name}`);
      }

      const scoredChoices = filterAndSortOtherChoices(filteredResults, transformedInput, lowerCaseInput, hasChoice);

      setScoredChoices(prompt, scoredChoices, 'resultLength > 0');
    }
  }
};

function filterAndSortOtherChoices(
  result: ScoredChoice[],
  transformedInput: string,
  lowerCaseInput: string,
  hasChoice: boolean,
) {
  const infos: ScoredChoice[] = [];
  const filterConditions = result.filter((r) => {
    if (r.item.miss) {
      return !hasChoice;
    }
    if (r.item.info) {
      infos.push(r);
      return false;
    }
    if (r.item.pass) {
      return true;
    }
    if (r.item.hideWithoutInput) {
      return transformedInput !== '';
    }

    return true;
  });
  // Sort that r.item.name.includes(transformedInput) is first
  // And the closer the includes to the start of the name, the closer to the front of the array

  filterConditions.sort((a, b) => {
    const aIndex = a.item.name.toLowerCase().indexOf(lowerCaseInput);
    const bIndex = b.item.name.toLowerCase().indexOf(lowerCaseInput);

    if (aIndex === bIndex) {
      return 0;
    }

    if (aIndex === -1) {
      return 1;
    }

    if (bIndex === -1) {
      return -1;
    }

    return aIndex - bIndex;
  });

  filterConditions.unshift(...infos);

  return filterConditions;
}

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

  const rawResult = prompt.flagSearch?.qs?.search(input);
  const result = rawResult?.map((sc) => fixHighlightRanges(sc as ScoredChoice)) as ScoredChoice[];

  if (prompt.flagSearch.hasGroup) {
    // Build a map for constant time access
    const resultMap = new Map();
    const keepGroups = new Set();
    for (const r of result) {
      resultMap.set(r.item.id, r);
      keepGroups.add(r.item.group);
    }

    keepGroups.add('Pass');

    let groupedResults: ScoredChoice[] = [];

    const matchGroup = [
      createScoredChoice({
        name: 'Exact Match',
        group: 'Match',
        pass: true,
        skip: true,
        nameClassName: defaultGroupNameClassName,
        className: defaultGroupClassName,
        height: PROMPT.ITEM.HEIGHT.XXXS,
      }),
    ];
    const missGroup: ScoredChoice[] = [];

    for (const choice of prompt.flagSearch.choices) {
      const hide = choice?.hideWithoutInput && input === '';
      const miss = choice?.miss && !hide;
      if (miss) {
        missGroup.push(createScoredChoice(choice));
      } else if (!hide) {
        const scoredChoice = resultMap.get(choice.id);
        if (choice?.pass) {
          groupedResults.push(createScoredChoice(choice));
        }

        if (scoredChoice) {
          groupedResults.push(scoredChoice);
        } else if (choice?.skip && keepGroups?.has(choice?.group)) {
          groupedResults.push(createScoredChoice(choice));
        }
      }
    }

    if (matchGroup.length > 1) {
      groupedResults = matchGroup.concat(groupedResults);
    }

    if (groupedResults.length === 0) {
      groupedResults = missGroup;
    }

    setScoredFlags(prompt, groupedResults);
  } else if (result?.length === 0) {
    const missGroup = [];
    for (const choice of prompt.flagSearch.choices) {
      if (choice?.miss) {
        missGroup.push(createScoredChoice(choice));
      }
    }
    setScoredFlags(prompt, missGroup);
  } else {
    setScoredFlags(prompt, result);
  }
};

export const setFlags = (prompt: KitPrompt, f: FlagsWithKeys & Partial<Choice>) => {
  log.info(`${prompt.getLogPrefix()}: 🔥 Setting flags: ${Object.keys(f)}`);
  const order = f?.order || [];
  const sortChoicesKey = f?.sortChoicesKey || [];

  // TODO: Think through type conversion here
  let flagChoices: any[] = [];
  for (const [key, value] of Object.entries(f)) {
    if (key !== 'order' && key !== 'sortChoicesKey') {
      flagChoices.push({
        ...(value as any),
        id: key,
        group: value?.group,
        command: value?.name,
        filePath: value?.name,
        name: value?.name || key,
        shortcut: value?.shortcut || '',
        tag: value?.tag || value?.shortcut || '',
        friendlyShortcut: value?.shortcut || '',
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

  prompt.flagSearch.qs = new QuickScore(choices, {
    keys: prompt.kitSearch.keys,
    minimumScore: kitState?.kenvEnv?.KIT_SEARCH_MIN_SCORE
      ? Number.parseInt(kitState?.kenvEnv?.KIT_SEARCH_MIN_SCORE, 10)
      : 0.6,
    transformString: normalizeWithMap,
    config: createConfig({ wordSeparators: '-_' }),
  } as any);

  // setFlagShortcodes(choices);

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

    if (postfix) {
      prompt.kitSearch.postfixes.set(choice?.pass.trim(), choice);
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
    prompt.kitSearch.qs = null;
    return;
  }

  const scoredChoices = choices.map(createScoredChoice);
  if (generated) {
    setScoredChoices(prompt, scoredChoices, 'generated');
    return;
  }

  if (prompt.scriptPath === getMainScriptPath()) {
    log.info(`${prompt.getLogPrefix()}: 💝 Caching main menu choices. First script: ${scoredChoices?.[1]?.item?.name}`);
    kitCache.choices = scoredChoices;
  }

  prompt.kitSearch.choices = choices.filter((c) => !c?.exclude);
  prompt.kitSearch.hasGroup = Boolean(choices?.find((c: Choice) => c?.group));

  prompt.kitSearch.qs = new QuickScore(choices, {
    keys: prompt.kitSearch.keys,
    minimumScore: kitState?.kenvEnv?.KIT_SEARCH_MIN_SCORE
      ? Number.parseInt(kitState?.kenvEnv?.KIT_SEARCH_MIN_SCORE, 10)
      : 0.6,
    transformString: normalizeWithMap,
    config: createConfig({ wordSeparators: '-_' }),
  } as any);
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
  log.verbose(`${prompt.pid}: ${reason} 🎼 Scored choices count: ${choices.length}`);

  const sendToPrompt = prompt.sendToPrompt;
  sendToPrompt(Channel.SET_SCORED_CHOICES, choices);

  if (
    prompt.scriptPath === getMainScriptPath() &&
    prompt.kitSearch.input === '' &&
    !prompt.kitSearch.inputRegex &&
    choices?.length > 0
  ) {
    log.info(
      `${prompt.getLogPrefix()}: Caching main scored choices: ${choices.length}. First choice: ${choices[0]?.item?.name}`,
    );
    sendToPrompt(AppChannel.SET_CACHED_MAIN_SCORED_CHOICES, choices);
  }
};

export const setScoredFlags = (prompt: KitPrompt, choices: ScoredChoice[] = []) => {
  log.silly(`${prompt.getLogPrefix()}: 🎼 Scored flags count: ${choices.length}`);
  prompt.sendToPrompt(Channel.SET_SCORED_FLAGS, choices);
};
