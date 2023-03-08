/* eslint-disable react/require-default-props */
import React, { useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FixedSizeList as List } from 'react-window';
import { useAtom, useAtomValue } from 'jotai';
import memoize from 'memoize-one';
import Preview from './preview';
import {
  _index,
  previewEnabledAtom,
  hasPreviewAtom,
  previewHTMLAtom,
  itemHeightAtom,
  appDbAtom,
  infoChoicesAtom,
} from '../jotai';
import { ChoiceButtonProps, ListProps } from '../types';
import { DEFAULT_LIST_WIDTH, DEFAULT_WIDTH } from '../defaults';
import InfoButton from './infobutton';

const createItemData = memoize(
  (choices) =>
    ({
      choices,
    } as ChoiceButtonProps['data'])
);

export default function InfoList({ width, height }: ListProps) {
  const containerRef = useRef(null);
  const listRef = useRef(null);
  const innerRef = useRef(null);
  // TODO: In case items ever have dynamic height
  const [choices] = useAtom(infoChoicesAtom);
  // const [inputValue] = useAtom(inputAtom);
  // const [mainHeight, setMainHeight] = useAtom(mainHeightAtom);
  const [previewEnabled] = useAtom(previewEnabledAtom);
  const [hasPreview] = useAtom(hasPreviewAtom);
  const [previewHTML] = useAtom(previewHTMLAtom);
  const [appDb] = useAtom(appDbAtom);
  const itemHeight = useAtomValue(itemHeightAtom);

  // const listWidth = useMotionValue('100%');

  const itemData = createItemData(choices);

  // useResizeObserver(innerRef, (entry) => {
  //   if (entry?.contentRect?.height) {
  //     setMainHeight(entry.contentRect.height);
  //   }
  // });

  // useEffect(() => {
  //   const newListHeight = choices.length * BUTTON_HEIGHT;
  //   console.log('newListHeight', newListHeight);
  //   setMainHeight(newListHeight);
  // }, [choices, setMainHeight]);

  // useEffect(() => {
  //   const newListHeight = choices.length * BUTTON_HEIGHT;
  //   console.log('newListHeight', newListHeight);
  //   setMainHeight(newListHeight);
  // }, []);

  // useResizeObserver(containerRef, (entry) => {
  //   if (entry?.contentRect?.height) {
  //     // setMainHeight(entry.contentRect.height);
  //     setInfoHeight(entry.contentRect.height);
  //   }
  // });

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{
        opacity: choices?.length ? 1 : 0,
      }}
      transition={{ duration: 0.15, ease: 'circOut' }}
      id="list"
      className={`

      list-component
      flex flex-row
      w-full
      overflow-y-hidden border-t border-secondary
      `}
      style={
        {
          width,
          height: choices.length * itemHeight,
        } as any
      }
    >
      <List
        style={{
          minWidth:
            previewEnabled && hasPreview ? DEFAULT_LIST_WIDTH : DEFAULT_WIDTH,
        }}
        ref={listRef}
        innerRef={innerRef}
        height={choices.length * itemHeight}
        itemCount={choices?.length || 0}
        itemSize={itemHeight}
        width="100%"
        itemData={itemData}
        className={`
        wrapper
        px-0 flex flex-col
        text-text-base
        overflow-y-scroll focus:border-none focus:outline-none outline-none flex-1 bg-opacity-20

        ${
          !appDb.mini && previewEnabled && hasPreview
            ? 'border-r  border-secondary'
            : ''
        }
        `}
        // onItemsRendered={onItemsRendered}
      >
        {InfoButton}
      </List>

      {/* {previewEnabled && <Preview />} */}
      <AnimatePresence key="previewComponents">
        {!appDb.mini && previewHTML && <Preview key="AppPreview" />}
      </AnimatePresence>
    </motion.div>
  );
}
