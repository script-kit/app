import React, { useCallback } from 'react';
import { useAtomValue } from 'jotai';
import { processesAtom, runProcessesAtom } from './jotai';

export default function ProcessesDot() {
  const processes = useAtomValue(processesAtom);
  const runProcesses = useAtomValue(runProcessesAtom);

  const onProcessButtonClick = useCallback(() => {
    runProcesses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processes, runProcesses]);

  return (
    <button
      type="button"
      onClick={onProcessButtonClick}
      className="absolute top-1 right-1
    z-50 flex h-4 w-4 cursor-pointer items-center
    justify-center
    rounded-full
     text-xxs
    font-bold text-primary brightness-75 filter hover:bg-text-base/10
    hover:brightness-100
    "
    >
      {processes?.length - 1}
    </button>
  );
}
