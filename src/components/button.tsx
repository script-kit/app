/* eslint-disable jsx-a11y/mouse-events-have-key-events */
/* eslint-disable react/no-array-index-key */
/* eslint-disable no-nested-ternary */
import React from 'react';
import parse from 'html-react-parser';
import { ChoiceData } from '../types';
import { Mode } from '../enums';

interface ChoiceButtonProps {
  choice: any;
  i: number;
  submit: (choice: any) => void;
  inputValue: string;
  index: number;
  setIndex: (i: number) => void;
  mode: Mode;
  mouseEnabled: boolean;
}

const noHighlight = (name: string, input: string) => {
  return <span>{name}</span>;
};

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
        <span key={i} className="dark:text-primary-light text-primary-dark">
          {letter}
        </span>
      );
    }

    prevQualifies = Boolean(letter.match(/\W/));

    return <span key={i}>{letter}</span>;
  });
};

const highlightFirstLetters = (name: string, input: string) => {
  const words = name.match(/\w+\W*/g);

  return (words || []).map((word, i) => {
    if (input[i]) {
      return (
        // eslint-disable-next-line react/no-array-index-key
        <React.Fragment key={i}>
          <span key={i} className=" dark:text-primary-light text-primary-dark">
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
    <span key={1} className="dark:text-primary-light text-primary-dark">
      {includesPart}
    </span>,
    <span key={2}>{lastPart}</span>,
  ];
};

const highlightStartsWith = (name: string, input: string) => {
  const firstPart = name.slice(0, input.length);
  const lastPart = name.slice(input.length);

  return [
    <span key={0} className="dark:text-primary-light text-primary-dark">
      {firstPart}
    </span>,
    <span key={1}>{lastPart}</span>,
  ];
};

const firstLettersMatch = (name: string, input: string) => {
  const splitName = name.match(/\w+\W*/g) || [];
  const inputLetters = input.split('');
  if (inputLetters.length > splitName.length) return false;

  return inputLetters.every((il, i) => {
    return il === splitName[i][0];
  });
};

const highlightChoiceName = (
  mode: Mode,
  choice: ChoiceData,
  input: string,
  name: string,
  inputValue: string
) => {
  return mode === (Mode.GENERATE || Mode.MANUAL)
    ? noHighlight(choice.name, inputValue)
    : name.startsWith(input)
    ? highlightStartsWith(choice.name, inputValue)
    : !name.match(/\w/)
    ? noHighlight(choice.name, inputValue)
    : firstLettersMatch(name, input)
    ? highlightFirstLetters(choice.name, inputValue)
    : name.includes(input)
    ? highlightIncludes(choice.name, inputValue)
    : highlightAdjacentAndWordStart(choice.name, inputValue);
};

export default function ChoiceButton({
  choice,
  i,
  submit,
  inputValue,
  index,
  setIndex,
  mode,
  mouseEnabled,
}: ChoiceButtonProps) {
  const input = inputValue?.toLowerCase();
  const name = choice?.name?.toLowerCase();

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <button
      type="button"
      key={choice.uuid}
      className={`
  w-full
  h-16
  flex-shrink-0
  whitespace-nowrap
  text-left
  flex
  flex-row
  text-lg
  px-4
  justify-between
  items-center
  focus:outline-none
  ${
    index === i
      ? `dark:bg-white dark:bg-opacity-5 bg-white bg-opacity-80 shadow-lg`
      : ``
  }`}
      onClick={(_event) => {
        submit(choice.value);
      }}
      onMouseOver={() => {
        if (mouseEnabled) setIndex(i);
      }}
    >
      {choice?.html ? (
        parse(choice?.html, {
          replace: (domNode: any) => {
            if (domNode?.attribs && index === i)
              domNode.attribs.class = 'focused';
            return domNode;
          },
        })
      ) : (
        <div className="flex flex-row h-full w-full justify-between items-center">
          <div className="flex flex-col max-w-full">
            <div className="truncate">
              {highlightChoiceName(mode, choice, input, name, inputValue)}
            </div>
            {(choice?.focused || choice?.description) && (
              <div
                className={`text-xs truncate transition-opacity ease-in-out duration-100 pb-1 ${
                  index === i
                    ? `opacity-90 dark:text-primary-light text-primary-dark`
                    : `opacity-60`
                }`}
              >
                {(index === i && choice?.description) || choice?.description}
              </div>
            )}
          </div>
          {choice?.img && (
            <img src={choice.img} alt={choice.name} className="py-2 h-full" />
          )}
        </div>
      )}
    </button>
  );
}
