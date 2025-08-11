import { useAtom, useAtomValue } from 'jotai';
import { useCallback } from 'react';
import {
  applyUpdateAtom,
  descriptionAtom,
  isMainScriptAtom,
  kitStateAtom,
  logoAtom,
  nameAtom,
  processesAtom,
  promptDataAtom,
  socialAtom,
} from '../jotai';

const TopRightButton = () => {
  const name = useAtomValue(nameAtom);

  const applyUpdate = useAtomValue(applyUpdateAtom);
  const kitState = useAtomValue(kitStateAtom);
  const social = useAtomValue(socialAtom);

  const onUpdateButtonClick = useCallback(() => {
    applyUpdate();
  }, [applyUpdate]);

  if (kitState.updateDownloaded) {
    return (
      <button
        type="button"
        key="update"
        onClick={onUpdateButtonClick}
        tabIndex={-1}
        // add the hand pointer cursor
        className="
        primary -mr-2 -mt-0.5 flex cursor-pointer flex-row items-center
        rounded-md bg-text-base bg-opacity-10 font-bold text-primary
        hover:bg-opacity-20

        "
      >
        <span className="pl-2">Update</span>
        <i className="gg-play-button -ml-1.5 scale-75" />
      </button>
    );
  }

  return (
    <>
      <span
        style={{
          WebkitAppRegion: 'drag',
          WebkitUserSelect: 'none',
        }}
        className="truncate"
      >
        {name}
      </span>

      {social && (
        <span>
          <span>&nbsp;-&nbsp;</span>
          <a href={social.url}>{social.username}</a>
        </span>
      )}
    </>
  );
};

export default function Header() {
  const [description] = useAtom(descriptionAtom);
  const [logo] = useAtom(logoAtom);
  const [name] = useAtom(nameAtom);
  const [processes] = useAtom(processesAtom);
  const [isMainScript] = useAtom(isMainScriptAtom);
  const [promptData] = useAtom(promptDataAtom);


  return (
    <div
      style={
        {
          WebkitAppRegion: 'no-drag',
          WebkitUserSelect: 'none',
        } as any
      }
      className="flex w-full flex-row justify-between
      "
    >
      <div
        className={`
        flex
      w-full flex-row items-center px-4 pt-3 font-mono text-xxs font-bold
      uppercase text-primary ${isMainScript && processes?.length > 1 ? '-my-1' : ''}
      ${promptData?.headerClassName || ''}
      `}
      >
        <div
          style={{
            WebkitAppRegion: 'drag',
            WebkitUserSelect: 'none',
          }}
          className="flex flex-row"
        >
          {logo ? (
            <img src={logo} alt={name} className="h-4 pr-2" />
          ) : (
            <span className="truncate pr-1">{description}</span>
          )}
        </div>
        <div
          style={{
            WebkitAppRegion: 'drag',
            WebkitUserSelect: 'none',
          }}
          className="-mt-4 h-full flex-1"
        />
        <span className="flex flex-row items-end pl-1 text-right">
          <TopRightButton key="top-right-button" />
        </span>
      </div>
      {false}
    </div>
  );
}
