/* eslint-disable react/require-default-props */
import React, {
  useCallback,
  useState,
  forwardRef,
  useEffect,
  useRef,
} from 'react';
import { FixedSizeList as List } from 'react-window';
import { useAtom } from 'jotai';
import memoize from 'memoize-one';
import { Choice } from 'kit-bridge/cjs/type';
import Preview from './preview';
import ChoiceButton from './button';
import { choicesAtom, indexAtom, inputAtom } from '../jotai';

interface ChoiceButtonData {
  choices: Choice[];
  currentIndex: number;
  inputValue: string;
  mouseEnabled: boolean;
  onIndexChange: (index: number) => void;
  onIndexSubmit: (index: number) => void;
}
interface ChoiceButtonProps {
  data: ChoiceButtonData;
  index: number;
  style: any;
}
interface ListProps {
  height: number;
  width: number;
  onListChoicesChanged: (listHeight: number) => void;
  onIndexChange: ChoiceButtonData['onIndexChange'];
  onIndexSubmit: ChoiceButtonData['onIndexSubmit'];
}

const createItemData = memoize(
  (choices, currentIndex, mouseEnabled, onIndexChange, onIndexSubmit) =>
    ({
      choices,
      currentIndex,
      mouseEnabled,
      onIndexChange,
      onIndexSubmit,
    } as ChoiceButtonProps['data'])
);

export default forwardRef<HTMLDivElement, ListProps>(function ChoiceList(
  {
    width,
    height,
    onListChoicesChanged,
    onIndexChange,
    onIndexSubmit,
  }: ListProps,
  ref
) {
  const listRef = useRef(null);
  const [mouseEnabled, setMouseEnabled] = useState(false);
  // TODO: In case items ever have dynamic height
  const [listItemHeight, setListItemHeight] = useState(64);
  const [choices] = useAtom(choicesAtom);
  const [index] = useAtom(indexAtom);
  const [inputValue] = useAtom(inputAtom);

  const itemData = createItemData(
    choices,
    index,
    mouseEnabled,
    onIndexChange,
    onIndexSubmit
  );

  useEffect(() => {
    setMouseEnabled(false);
  }, [inputValue, choices]);

  useEffect(() => {
    let id: any = 0;
    if (choices.length) {
      id = setTimeout(() => {
        setMouseEnabled(true);
      }, 500);
    } else {
      setMouseEnabled(false);
    }
    return () => {
      clearTimeout(id);
    };
  }, [choices.length]);

  useEffect(() => {
    const newListHeight = choices.length * listItemHeight;
    onListChoicesChanged(newListHeight);
  }, [choices.length, listItemHeight, onListChoicesChanged]);

  useEffect(() => {
    (listRef as any).current.scrollToItem(index);
  }, [index]);

  return (
    <div
      ref={ref}
      className={`
      list-component
      flex flex-row
      w-full min-w-1/2
      overflow-y-hidden border-t dark:border-white dark:border-opacity-5 border-black border-opacity-5
      `}
      style={
        {
          width,
          height,
          WebkitAppRegion: 'no-drag',
          WebkitUserSelect: 'none',
        } as any
      }
    >
      <List
        ref={listRef}
        height={height}
        itemCount={choices?.length || 0}
        itemSize={listItemHeight}
        width="100%"
        itemData={itemData}
        className={`
        h-full
        px-0 flex flex-col
        text-black dark:text-white
        overflow-y-scroll focus:border-none focus:outline-none outline-none flex-1 bg-opacity-20 min-w-1/2`}
        // onItemsRendered={onItemsRendered}
      >
        {ChoiceButton}
      </List>
      {choices?.[index]?.preview && (
        <Preview preview={choices?.[index]?.preview || ''} />
      )}
    </div>
  );
});
