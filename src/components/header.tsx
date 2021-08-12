import React from 'react';
import { useAtom } from 'jotai';
import {
  choicesAtom,
  darkAtom,
  mainHeightAtom,
  mouseEnabledAtom,
  panelHTMLAtom,
  scriptAtom,
  selectedAtom,
  topHeightAtom,
  uiAtom,
  unfilteredChoicesAtom,
} from '../jotai';

export default function Header() {
  const [script] = useAtom(scriptAtom);
  const [mainHeight] = useAtom(mainHeightAtom);
  const [topHeight] = useAtom(topHeightAtom);
  const [panelHTML] = useAtom(panelHTMLAtom);
  const [ui] = useAtom(uiAtom);
  const [mouseEnabled] = useAtom(mouseEnabledAtom);
  const [unfilteredChoices] = useAtom(unfilteredChoicesAtom);
  const [choices] = useAtom(choicesAtom);
  const [selected] = useAtom(selectedAtom);
  const [dark] = useAtom(darkAtom);

  return (
    <div
      className={`
    header-component transition
    text-xxs uppercase font-mono font-bold justify-between pt-3 px-4 flex flex-row dark:text-primary-light text-primary-dark `}
    >
      <span>
        {script?.description || ''}
        {/* {dark ? 'Dark' : 'Light'} */}
        {/* {unfilteredChoices.length} : {choices.length} */}
        {/* {topHeight},{mainHeight},{maxHeight},{panelHTML?.length},{ui} */}
      </span>

      {/* <span className="dark:text-primary-light text-primary-dark col-span-3">
        {`top: ${topHeight} - main: ${mainHeight} - max: ${maxHeight} -`}
      </span> */}
      <span>
        {script?.menu}
        {script?.twitter && (
          <span>
            <span> - </span>
            <a href={`https://twitter.com/${script?.twitter.slice(1)}`}>
              {script?.twitter}
            </a>
          </span>
        )}
      </span>
    </div>
  );
}
