import React from 'react';

export function highlight(string: string, matches: [number, number][], className: string) {
  const substrings = [];
  let previousEnd = 0;

  if (matches?.length) {
    for (const [start, end] of matches) {
      const prefix = string.substring(previousEnd, start);
      const match = <mark className={className}>{string.substring(start, end)}</mark>;

      substrings.push(prefix, match);
      previousEnd = end;
    }
  }
  substrings.push(string.substring(previousEnd));

  return <span>{React.Children.toArray(substrings)}</span>;
}
