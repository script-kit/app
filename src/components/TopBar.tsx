import React from 'react';
import { useAtom } from 'jotai';
import { loadingAtom } from '../jotai';

export default function TopBar() {
  const [loading] = useAtom(loadingAtom);

  return (
    <>
      {/* {loading && `LOADING`} */}
      <div
        className={`animate-visibility absolute top-0 left-0 w-full h-[2px] ${
          loading ? `visible opacity-100` : `invisible opacity-0`
        }`}
      >
        <div
          className={`${
            loading ? `animate-loading` : ``
          } bg-primary-dark dark:bg-primary-light h-full w-10 absolute top-0`}
        />
      </div>
    </>
  );
}
