import { useAtom } from 'jotai';
import { useEffect, useRef } from 'react';
import { flagValueAtom, submittedAtom } from '../jotai';

export default () => {
  const ref = useRef<HTMLElement>();
  const [flagValue] = useAtom(flagValueAtom);
  const [submitted] = useAtom(submittedAtom);

  useEffect(() => {
    if (ref?.current) ref?.current.focus();
  }, [flagValue, submitted]);

  return ref;
};
