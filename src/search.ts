import { PROMPT, Channel, Mode, UI } from '@johnlindquist/kit/cjs/enum';
import { Choice, Script, FlagsWithKeys } from '@johnlindquist/kit/types/core';

import log from 'electron-log';
import { debounce } from 'lodash';
import {
  getMainScriptPath,
  defaultGroupClassName,
  defaultGroupNameClassName,
  groupChoices,
  formatChoices,
  kenvPath,
} from '@johnlindquist/kit/cjs/utils';

import { quickScore, createConfig, QuickScore } from 'quick-score';
import { AppChannel, HideReason } from './enums';
import { kitState, kitSearch, flagSearch } from './state';
import { ScoredChoice } from './types';
import { createScoredChoice } from './helpers';
import { appToPrompt, sendToPrompt } from './channel';

export const invokeSearch = (rawInput: string, reason = 'normal') => {
  if (kitState.ui !== UI.arg) return;

  // log.info(`Search ${reason}: ${rawInput}`);
  // log.info({ inputRegex: kitSearch.inputRegex });
  let transformedInput = rawInput;
  if (kitSearch.inputRegex) {
    // eslint-disable-next-line no-param-reassign
    transformedInput = rawInput.match(kitSearch.inputRegex)?.[0] || '';
    // log.info(
    //   `Transformed input: ${transformedInput} using regex ${kitSearch.inputRegex}`
    // );
  }

  if (kitSearch.choices.length === 0) {
    setScoredChoices([]);
    return;
  }

  // TODO: Add kitSearch.computedInput?
  // Should probably separate rawInput from the input that comes after the regex...
  kitSearch.input = transformedInput;
  flagSearch.input = '';
  // log.info({ transformedInput });
  const lowerCaseInput = transformedInput?.toLowerCase();

  if (transformedInput === '') {
    const results = kitSearch.choices
      .filter((c) => {
        if (c?.miss || c?.pass || c?.hideWithoutInput) return false;

        return true;
      })
      .map(createScoredChoice);

    if (results?.length === 0) {
      const misses = kitSearch.choices
        .filter((c) => c?.miss || c?.info)
        .map(createScoredChoice);
      setScoredChoices(misses);
    } else {
      setScoredChoices(results);
    }

    return;
  }

  if (!kitSearch.qs) {
    log.warn(`No qs for ${kitState.scriptPath}`);
    return;
  }
  const result = (kitSearch?.qs as QuickScore<Choice>)?.search(
    transformedInput
  ) as ScoredChoice[];

  if (kitSearch.hasGroup) {
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

    const startsWithGroup = [];
    const includesGroup = [];
    const matchLastGroup = [];
    const missGroup = [];
    let alias: Choice;

    for (const choice of kitSearch.choices) {
      const lowerCaseName = choice.name?.toLowerCase();
      if ((choice as Script)?.alias === transformedInput) {
        alias = structuredClone(choice);
        alias.pass = false;
        alias.group = 'Alias';
      } else if (
        !choice?.skip &&
        !choice?.miss &&
        lowerCaseName?.includes(lowerCaseInput)
      ) {
        const scoredChoice = resultMap.get(choice.id);
        if (scoredChoice && !scoredChoice?.item?.lastGroup) {
          const c = structuredClone(scoredChoice);
          c.item.tag ||=
            c?.item?.kenv || c?.item?.group === 'Pass' ? '' : c?.item?.group;
          // This was breaking the choice.preview lookup in the SDK
          // c.item.id = Math.random();
          c.item.pass = false;
          c.item.exact = true;
          if (lowerCaseName.startsWith(lowerCaseInput)) {
            startsWithGroup.push(c);
          } else {
            includesGroup.push(c);
          }
        } else if (scoredChoice && scoredChoice?.item?.lastGroup) {
          const c = structuredClone(scoredChoice);
          c.item.tag =
            c?.item?.kenv || c?.item?.group === 'Pass' ? '' : c?.item?.group;
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
        if (miss) {
          missGroup.push(createScoredChoice(choice));
        } else if (!hide) {
          const scoredChoice = resultMap.get(choice.id);
          if (choice?.pass) {
            groupedResults.push(createScoredChoice(choice));
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
    const sortedRemoveGroups = Array.from(removeGroups).sort(
      (a, b) => b[1].index - a[1].index
    );
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
        if (a?.item?.keyword && !b?.item?.keyword) return -1;
        if (!a?.item?.keyword && b?.item?.keyword) return 1;

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
        })
      );

      startsWithGroup.push(...includesGroup);
      groupedResults.unshift(...startsWithGroup);
    }

    if (matchLastGroup.length > 0) {
      matchLastGroup.sort((a, b) => {
        if (a?.item?.keyword && !b?.item?.keyword) return -1;
        if (!a?.item?.keyword && b?.item?.keyword) return 1;

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
        })
      );
      groupedResults.push(...matchLastGroup);
    }

    if (groupedResults.length === 0) {
      groupedResults = missGroup;
    }

    if (alias) {
      groupedResults.unshift(
        createScoredChoice({
          name: 'Alias',
          group: 'Alias',
          pass: false,
          skip: true,
          nameClassName: defaultGroupNameClassName,
          className: defaultGroupClassName,
          height: PROMPT.ITEM.HEIGHT.XXXS,
          id: Math.random().toString(),
        }),
        createScoredChoice(alias)
      );
    }

    setScoredChoices(groupedResults);
  } else if (result?.length === 0) {
    const scoredChoices = [];
    for (const choice of kitSearch.choices) {
      for (const key of kitSearch.keys) {
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
          scoredChoices.push(scoredChoice);
          break;
        } else if (choice?.miss || choice?.pass || choice?.info) {
          scoredChoices.push(createScoredChoice(choice));
          break;
        }
      }
    }

    setScoredChoices(scoredChoices);
  } else {
    const allMisses = result.every((r) => r?.item?.miss && r?.item?.info);
    if (allMisses) {
      setScoredChoices(result);
    } else {
      const filterConditions = result.filter((r) => {
        if (r.item.miss) return false;
        if (r.item.info) return true;
        if (r.item.pass) return true;
        if (transformedInput === '' && r.item.hideWithoutInput) return false;

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

      setScoredChoices(filterConditions);
    }
  }
};

export const debounceInvokeSearch = debounce(invokeSearch, 100);

export const invokeFlagSearch = (input: string) => {
  flagSearch.input = input;
  if (input === '') {
    setScoredFlags(
      flagSearch.choices
        .filter((c) => !c?.pass && !c?.hideWithoutInput && !c?.miss)
        .map(createScoredChoice)
    );
    return;
  }

  const result = flagSearch?.qs?.search(input) as ScoredChoice[];

  if (flagSearch.hasGroup) {
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
    const missGroup = [];

    for (const choice of flagSearch.choices) {
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

    setScoredFlags(groupedResults);
  } else if (result?.length === 0) {
    const missGroup = flagSearch.choices
      .filter((c) => c?.miss)
      .map(createScoredChoice);
    setScoredFlags(missGroup);
  } else {
    setScoredFlags(result);
  }
};

export const setFlags = (f: FlagsWithKeys) => {
  const order = f?.order || [];
  const sortChoicesKey = f?.sortChoicesKey || [];

  let flagChoices = Object.entries(f)
    .filter(([key]) => {
      if (key === 'order') return false;
      if (key === 'sortChoicesKey') return false;
      return true;
    })
    .map(([key, value]: [string, any]) => {
      return {
        id: key,
        group: value?.group,
        command: value?.name,
        filePath: value?.name,
        name: value?.name || key,
        shortcut: value?.shortcut || '',
        friendlyShortcut: value?.shortcut || '',
        description: value?.description || '',
        value: key,
        preview: value?.preview || '',
      };
    });

  if (flagChoices.find((c: Choice) => c?.group)) {
    flagChoices = groupChoices(flagChoices, {
      order,
      sortChoicesKey,
    });
  }

  const choices = formatChoices(flagChoices);

  flagSearch.choices = choices;
  flagSearch.hasGroup = Boolean(choices?.find((c: Choice) => c?.group));
  function scorer(string: string, query: string, matches: number[][]) {
    return quickScore(
      string,
      query,
      matches as any,
      undefined,
      undefined,
      createConfig({
        maxIterations: kitState?.kenvEnv?.KIT_SEARCH_MAX_ITERATIONS
          ? parseInt(kitState?.kenvEnv?.KIT_SEARCH_MAX_ITERATIONS, 32)
          : 3,
      })
    );
  }

  flagSearch.qs = new QuickScore(choices, {
    keys: kitSearch.keys.map((name) => ({
      name,
      scorer,
    })),
    minimumScore: kitState?.kenvEnv?.KIT_SEARCH_MIN_SCORE
      ? parseInt(kitState?.kenvEnv?.KIT_SEARCH_MIN_SCORE, 10)
      : 0.6,
  } as any);

  // setFlagShortcodes(choices);

  log.info(`Flag choices: ${choices.length}`);
  invokeFlagSearch(flagSearch.input);
};

export const setShortcodes = (choices: Choice[]) => {
  kitSearch.shortcodes.clear();
  kitSearch.triggers.clear();
  kitSearch.postfixes.clear();

  for (const choice of choices) {
    const code = (choice?.shortcode || '').toLowerCase();

    if (code) {
      kitSearch.shortcodes.set(code, choice);
    }

    if (choice?.keyword) {
      // log.info(`🗝 Found keyword ${choice.keyword}`);
      kitSearch.keywords.set(choice.keyword.toLowerCase(), choice);
    }

    // TODO: Parse choice.trigger earlier during choice formatting?
    const trigger = (
      choice?.trigger ||
      choice?.name?.match(/(?<=\[)\w+(?=\])/i)?.[0] ||
      ''
    ).toLowerCase();

    if (trigger) {
      kitSearch.triggers.set(trigger, choice);
    }

    const postfix = typeof choice?.pass === 'string';

    if (postfix) {
      kitSearch.postfixes.set(choice?.pass.trim(), choice);
    }
  }
};

export const setChoices = (
  choices: Choice[],
  {
    preload,
    skipInitialSearch,
    generated,
  }: { preload: boolean; skipInitialSearch?: boolean; generated?: boolean }
) => {
  sendToPrompt(
    Channel.SET_SELECTED_CHOICES,
    (choices || []).filter((c: Choice) => c?.selected)
  );

  if (!choices || !Array.isArray(choices) || choices?.length === 0) {
    kitSearch.choices = [];
    setScoredChoices([]);
    kitSearch.hasGroup = false;
    kitSearch.qs = null;
    return;
  }

  if (generated) {
    log.info(`📦 ${kitState.pid} Generated choices: ${choices.length}`);

    setScoredChoices(choices.map(createScoredChoice));
    return;
  }

  log.info(`📦 ${kitState.pid} Choices: ${choices.length} preload: ${preload}`);
  kitSearch.choices = choices.filter((c) => !c?.exclude);
  kitSearch.hasGroup = Boolean(choices?.find((c: Choice) => c?.group));
  function scorer(string: string, query: string, matches: number[][]) {
    return quickScore(
      string,
      query,
      matches as any,
      undefined,
      undefined,
      createConfig({
        maxIterations: kitState?.kenvEnv?.KIT_SEARCH_MAX_ITERATIONS
          ? parseInt(kitState?.kenvEnv?.KIT_SEARCH_MAX_ITERATIONS, 32)
          : 3,
      })
    );
  }

  kitSearch.qs = new QuickScore(choices, {
    keys: kitSearch.keys.map((name) => ({
      name,
      scorer,
    })),
    minimumScore: kitState?.kenvEnv?.KIT_SEARCH_MIN_SCORE
      ? parseInt(kitState?.kenvEnv?.KIT_SEARCH_MIN_SCORE, 10)
      : 0.6,
  } as any);
  sendToPrompt(Channel.SET_CHOICES_CONFIG, { preload });

  setShortcodes(choices);
  const input = skipInitialSearch ? '' : kitSearch.input;
  // log.info({
  //   preload: preload ? 'true' : 'false',
  //   skipInitialSearch: skipInitialSearch ? 'true' : 'false',
  // });
  invokeSearch(input, 'setChoices');
};

export const setScoredChoices = (choices: ScoredChoice[]) => {
  if (choices?.length) {
    // log.info(`🎼 Scored choices count: ${choices.length}`);
  }
  sendToPrompt(Channel.SET_SCORED_CHOICES, choices);

  if (
    kitState.scriptPath === getMainScriptPath() &&
    kitSearch.input === '' &&
    !kitSearch.inputRegex &&
    choices?.length
  ) {
    log.info(
      `Caching main scored choices: ${choices.length}. First choice: ${choices[0]?.item?.name}`
    );
    appToPrompt(AppChannel.SET_CACHED_MAIN_SCORED_CHOICES, choices);
  }
};

export const setScoredFlags = (choices: ScoredChoice[]) => {
  // log.info(`🎼 Scored flags count: ${choices.length}`);
  sendToPrompt(Channel.SET_SCORED_FLAGS, choices);
};
