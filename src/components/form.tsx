/* eslint-disable no-restricted-syntax */
/* eslint-disable jsx-a11y/no-noninteractive-tabindex */
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/* eslint-disable jsx-a11y/mouse-events-have-key-events */
/* eslint-disable react/no-array-index-key */
/* eslint-disable no-nested-ternary */
import React, { useCallback, KeyboardEvent, useEffect } from 'react';
import parse, { domToReact } from 'html-react-parser';
import SimpleBar from 'simplebar-react';
import { useAtom } from 'jotai';
import { formDataAtom, formHTMLAtom, submitValueAtom } from '../jotai';
import { useObserveMainHeight } from '../hooks';

export default function Form({ height }: { height: number }) {
  // useEscape();

  const formRef = useObserveMainHeight<HTMLFormElement>('.wrapper > div');
  const [formHTML] = useAtom(formHTMLAtom);
  const [formData] = useAtom(formDataAtom);
  const [, submit] = useAtom(submitValueAtom);

  useEffect(() => {
    if (formRef.current) {
      formRef?.current?.reset();
    }
    if (formRef?.current?.elements?.[0]) {
      (formRef?.current?.elements as any)?.[0]?.focus();
    } else {
      formRef?.current?.focus();
    }
  }, [
    formRef?.current?.firstElementChild,
    formRef?.current?.elements,
    formRef,
    formData,
  ]);

  useEffect(() => {
    if (formData) {
      const data: any = formData;
      for (const el of formRef?.current?.elements as any) {
        if (data[el.name]) {
          const value = data[el.name];
          if (Array.isArray(value)) {
            for (const v of value) {
              if (el.value === v) {
                el.defaultChecked = true;
              }
            }
          } else {
            el.value = value;
          }
        }
      }

      if (document) {
        const wrapper: any = document.querySelector(
          '.simplebar-content-wrapper'
        );
        if (wrapper) {
          wrapper.tabIndex = -1;
        }
      }
    }
  }, [formData]);

  const onLocalSubmit = useCallback(
    (event) => {
      event.preventDefault();

      const data: any = new FormData(formRef?.current);

      const names: any = {};
      // const arrays: any = [];

      for (const el of (formRef?.current as any)?.elements) {
        if (names[el.name] === false) {
          names[el.name] = true;
        } else {
          names[el.name] = false;
        }
      }

      const formJSON = Object.fromEntries(data.entries());

      for (const [key, value] of Object.entries(names)) {
        if (key && value) {
          formJSON[key] = data.getAll(key);
        }
      }

      submit(formJSON);
    },
    [submit]
  );

  const onFormKeyDown = useCallback(
    (event: KeyboardEvent<HTMLFormElement>) => {
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case 's':
          case 'Enter':
            event.preventDefault();
            onLocalSubmit(event);
            break;

          default:
            break;
        }
      }
    },
    [onLocalSubmit]
  );

  const onFormChange = useCallback(() => {}, []);

  return (
    <SimpleBar
      className="w-screen"
      style={
        {
          WebkitAppRegion: 'no-drag',
          WebkitUserSelect: 'text',
          height,
          maxHeight: height,
        } as any
      }
    >
      <form
        onChange={onFormChange}
        ref={formRef}
        onKeyDown={onFormKeyDown}
        onSubmit={onLocalSubmit}
        className={`
        wrapper
        form-component
        kit-form
        border-none
        outline-none
      `}
      >
        {parse(formHTML, {
          replace: (domNode: any) => {
            if (
              domNode.attribs &&
              ['input', 'textarea', 'select'].includes(domNode.name)
            ) {
              domNode.attribs.onChange = () => {};
              return domToReact(domNode);
            }

            return domNode;
          },
        })}
      </form>
    </SimpleBar>
  );
}
