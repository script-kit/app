/* eslint-disable react/require-default-props */
import React, {
  useCallback,
  useState,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { FixedSizeList as List } from 'react-window';
import memoize from 'memoize-one';
import Preview from './preview';
import ChoiceButton from './button';
import { Choice, ChoiceButtonProps } from '../types';

interface ListProps {
  listHeight: number;
  filteredChoices: Choice[];
  onListHeightChanged: (listHeight: number) => void;
  onSubmit: (value: any) => void;
  setValue: (value: any) => void;
}

const createItemData = memoize(
  (choices, currentIndex, mouseEnabled, setIndex, submit) =>
    ({
      choices,
      currentIndex,
      mouseEnabled,
      setIndex,
      submit,
    } as ChoiceButtonProps['data'])
);

export default forwardRef<any, ListProps>(function ChoiceList(
  {
    listHeight,
    filteredChoices,
    onSubmit,
    onListHeightChanged,
    setValue,
  }: ListProps,
  ref
) {
  const listRef = useRef(null);
  const [index, setIndex] = useState(0);
  const [mouseEnabled, setMouseEnabled] = useState(false);
  const [listItemHeight, setListItemHeight] = useState(64);

  const itemData = createItemData(
    filteredChoices,
    index,
    mouseEnabled,
    setIndex,
    onSubmit
  );

  useEffect(() => {
    if (index > filteredChoices?.length - 1)
      setIndex(filteredChoices?.length - 1);
    if (filteredChoices?.length && index <= 0) setIndex(0);
  }, [filteredChoices?.length, index]);

  const onItemsRendered = useCallback(() => {
    const newListHeight = filteredChoices.length * listItemHeight;
    onListHeightChanged(newListHeight);
  }, [filteredChoices.length, listItemHeight, onListHeightChanged]);

  useEffect(() => {
    setValue(filteredChoices[index].value);
  }, [filteredChoices, index, setValue]);

  useImperativeHandle(ref, () => ({
    down: () => {
      if (index < filteredChoices.length - 1) {
        (listRef as any).current.scrollToItem(index + 1);
        setIndex(index + 1);
      }
    },
    up: () => {
      if (index > 0) {
        (listRef as any).current.scrollToItem(index - 1);
        setIndex(index - 1);
      }
    },
  }));

  return (
    <div
      ref={ref}
      className="flex flex-row w-full overflow-y-hidden border-t dark:border-white dark:border-opacity-5 border-black border-opacity-5 min-w-1/2"
      style={
        {
          WebkitAppRegion: 'no-drag',
          WebkitUserSelect: 'none',
          height: listHeight,
        } as any
      }
      // TODO: FIGURE OUT MOUSE INTERACTION 🐭
      onMouseEnter={() => setMouseEnabled(true)}
    >
      <List
        ref={listRef}
        height={listHeight}
        itemCount={filteredChoices?.length}
        itemSize={listItemHeight}
        width="100%"
        itemData={itemData}
        className="px-0 flex flex-col text-black dark:text-white overflow-y-scroll focus:border-none focus:outline-none outline-none flex-1 bg-opacity-20 min-w-1/2"
        onItemsRendered={onItemsRendered}
      >
        {ChoiceButton}
      </List>
      {filteredChoices?.[index]?.preview && (
        <Preview preview={filteredChoices?.[index]?.preview || ''} />
      )}
    </div>
  );
});
