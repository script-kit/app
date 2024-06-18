/* eslint-disable react/no-array-index-key */
/* eslint-disable no-nested-ternary */
import React, { type ReactElement } from 'react';

const className = 'text-primary';

const highlightAdjacentAndWordStart = (name: string, input: string) => {
  const inputLetters = input?.toLowerCase().split('');
  let ili = 0;
  let prevQualifies = true;

  // TODO: Optimize
  return name.split('').map((letter, i) => {
    if (letter?.toLowerCase() === inputLetters[ili] && prevQualifies) {
      ili += 1;
      prevQualifies = true;
      return (
        <span key={`${name}_${letter}`} className={className}>
          {letter}
        </span>
      );
    }

    prevQualifies = Boolean(letter.match(/\W/));

    return <span key={`${name}_${letter}_${prevQualifies}`}>{letter}</span>;
  });
};

const highlightFirstLetters = (name: string, input: string) => {
  const words = name.match(/\w+\W*/g);

  return (words || []).map((word, i) => {
    if (input[i]) {
      return (
        // eslint-disable-next-line react/no-array-index-key
        <React.Fragment key={i}>
          <span key={i} className={className}>
            {word[0]}
          </span>
          {word.slice(1)}
        </React.Fragment>
      );
    }

    return word;
  });
};

const highlightIncludes = (name: string, input: string) => {
  const index = name?.toLowerCase().indexOf(input?.toLowerCase());
  const indexEnd = index + input.length;

  const firstPart = name.slice(0, index);
  const includesPart = name.slice(index, indexEnd);
  const lastPart = name.slice(indexEnd);

  return [
    <span key={0}>{firstPart}</span>,
    <span key={1} className={className}>
      {includesPart}
    </span>,
    <span key={2}>{lastPart}</span>,
  ];
};

const highlightStartsWith = (name: string, input: string) => {
  const firstPart = name.slice(0, input.length);
  const lastPart = name.slice(input.length);

  return [
    <span key={0} className={className}>
      {firstPart}
    </span>,
    <span key={1}>{lastPart}</span>,
  ];
};

const firstLettersMatch = (name: string, input: string) => {
  const splitName = name.match(/\w+\W*/g) || [];
  const inputLetters = input.split('');
  if (inputLetters.length > splitName.length) {
    return false;
  }

  return inputLetters.every((il, i) => {
    return il === splitName[i][0];
  });
};

export const highlightChoiceName = (name: string, input: string): string | ReactElement[] => {
  const nameLower = name.toLowerCase();
  const inputLower = input.toLowerCase();

  if (nameLower.startsWith(inputLower)) {
    return highlightStartsWith(name, input);
  }

  if (!nameLower.match(/\w/)) {
    return name;
  }

  if (firstLettersMatch(nameLower, inputLower)) {
    return highlightFirstLetters(name, input) as ReactElement[];
  }

  if (nameLower.includes(inputLower)) {
    return highlightIncludes(name, input);
  }

  return highlightAdjacentAndWordStart(name, input);
};
