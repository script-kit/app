import { useAtomValue } from 'jotai';
import { useState, useEffect } from 'react';
import { logAtom } from '../jotai';

function useKeepAlive(interval = 60000) {
  const [tick, setTick] = useState(0);
  const log = useAtomValue(logAtom);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setTick(Math.random());
      log(`🖖 Keep alive`);
    }, interval);

    return () => {
      clearInterval(intervalId);
    };
  }, [interval]);

  return tick;
}

export default useKeepAlive;
