import type React from 'react';

export function highlight(string: string, matches: [number, number][], className: string) {
  const parts: React.ReactNode[] = [];
  let previousEnd = 0;

  if (matches?.length) {
    matches.forEach(([start, end], i) => {
      const prefix = string.substring(previousEnd, start);
      if (prefix) {
        parts.push(<span key={`t-${previousEnd}-${i}`}>{prefix}</span>);
      }
      parts.push(
        <mark key={`m-${start}-${end}-${i}`} className={className}>
          {string.substring(start, end)}
        </mark>,
      );
      previousEnd = end;
    });
  }

  const tail = string.substring(previousEnd);
  if (tail || parts.length === 0) {
    parts.push(<span key={`t-${previousEnd}-tail`}>{tail}</span>);
  }

  return <span>{parts}</span>;
}
