import type { Getter } from 'jotai';

export type FlagMeta = {
  sessionKey: string;
  version: number;
};

export type FlagFreshnessInput = {
  flag?: string;
  overlayOpen: boolean;
  flagMeta: FlagMeta;
  lastConsumed: FlagMeta;
};

export const hasFreshFlag = ({
  flag,
  overlayOpen,
  flagMeta,
  lastConsumed,
}: FlagFreshnessInput): boolean => {
  if (!flag) return false;
  if (overlayOpen) return true;
  if (!flagMeta?.sessionKey || !flagMeta.version) return false;

  if (!lastConsumed?.sessionKey && !lastConsumed?.version) {
    return true;
  }

  return (
    flagMeta.sessionKey !== lastConsumed.sessionKey ||
    flagMeta.version !== lastConsumed.version
  );
};
