/* eslint-disable no-restricted-syntax */
/* eslint-disable jsx-a11y/no-noninteractive-tabindex */
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/* eslint-disable jsx-a11y/mouse-events-have-key-events */
/* eslint-disable react/no-array-index-key */
/* eslint-disable no-nested-ternary */
import React, { useCallback, useRef, KeyboardEvent, useEffect } from 'react';
import parse, { domToReact } from 'html-react-parser';
import SimpleBar from 'simplebar-react';
import { useAtom } from 'jotai';
import { formDataAtom, formHTMLAtom, submitValueAtom } from '../jotai';
import { useEscape, useMountMainHeight, useObserveMainHeight } from '../hooks';

export default function Form() {
  useEscape();

  const formRef = useObserveMainHeight<HTMLFormElement>();
  const [formHTML] = useAtom(formHTMLAtom);
  const [formData] = useAtom(formDataAtom);
  const [, submit] = useAtom(submitValueAtom);

  useEffect(() => {
    if (formRef?.current?.elements?.[0]) {
      (formRef?.current?.elements as any)?.[0]?.focus();
    } else {
      formRef?.current?.focus();
    }
  }, [
    formRef?.current?.firstElementChild,
    formRef?.current?.elements,
    formRef,
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
    }
  }, [formData]);

  const onLocalSubmit = useCallback(
    (event) => {
      event.preventDefault();

      const data: any = new FormData(formRef?.current);

      const names: any = {};
      // const arrays: any = [];
      for (const el of formRef?.current?.elements) {
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
      className="w-full h-full"
      style={
        {
          WebkitAppRegion: 'no-drag',
          WebkitUserSelect: 'text',
        } as any
      }
    >
      <form
        onChange={onFormChange}
        tabIndex={0}
        ref={formRef}
        onKeyDown={onFormKeyDown}
        onSubmit={onLocalSubmit}
        className={`
        w-full h-full
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
