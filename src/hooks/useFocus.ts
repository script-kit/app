import { useEffect, useRef } from 'react';

export default () => {
  const ref = useRef<any>();

  useEffect(() => {
    ref?.current.focus();
  }, []);

  return ref;
};
