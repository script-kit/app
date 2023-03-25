/* eslint-disable no-restricted-syntax */
/* eslint-disable jsx-a11y/no-noninteractive-tabindex */
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/* eslint-disable jsx-a11y/mouse-events-have-key-events */
/* eslint-disable react/no-array-index-key */
/* eslint-disable no-nested-ternary */
import React, { useCallback, KeyboardEvent, useEffect } from 'react';
import parse, { domToReact } from 'html-react-parser';
import SimpleBar from 'simplebar-react';
import { useAtom, useAtomValue } from 'jotai';
import {
  changeAtom,
  formDataAtom,
  formHTMLAtom,
  submitValueAtom,
} from '../jotai';
import { useObserveMainHeight } from '../hooks';

export default function Form() {
  // useEscape();

  const formRef = useObserveMainHeight<HTMLFormElement>('.wrapper > div');
  const [formHTML] = useAtom(formHTMLAtom);
  const [formData] = useAtom(formDataAtom);
  const [, submit] = useAtom(submitValueAtom);
  const onChange = useAtomValue(changeAtom);

  useEffect(() => {
    if (formRef.current) {
      formRef?.current?.reset();
    }
    if (formRef?.current?.elements?.[0]) {
      (formRef?.current?.elements as any)?.[0]?.focus();
    } else {
      formRef?.current?.focus();
    }
  }, [formRef, formData]);

  useEffect(() => {
    const handler = () => {
      (document as any).kitForm?.requestSubmit();
    };

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
        const enterButton = document.querySelector('button[tabindex="0"]');
        if (enterButton) {
          enterButton.addEventListener('click', handler);
        }
      }
    }
    return () => {
      document
        ?.querySelector('button[tabindex="0"]')
        ?.removeEventListener('click', handler);
    };
  }, [formData, formRef]);

  const getFormJSON = useCallback(() => {
    const data: any = new FormData(formRef?.current);
    const els: any[] = Array.from((formRef?.current as any)?.elements);

    // create an array of names which have more than one element
    const multis = els.reduce((acc: string[], curr: any) => {
      if (
        curr.name &&
        els.filter((e) => e !== curr).find((e: any) => e.name === curr.name) &&
        !acc.includes(curr.name)
      ) {
        acc.push(curr.name);
      }

      return acc;
    }, []);

    const formJSON = {};
    for (const el of els) {
      if (el.name) {
        if (multis.includes(el.name)) {
          formJSON[el.name] = data.getAll(el.name);
        } else {
          const value = data.get(el.name);
          formJSON[el.name] = value?.path || value;
        }
      }
    }

    return formJSON;
  }, [formRef]);

  const onLocalSubmit = useCallback(
    (event?: any) => {
      if (event) event.preventDefault();

      submit(getFormJSON());
    },
    [getFormJSON, submit]
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

  const onFormChange = useCallback(
    (event?: any) => {
      // if (event) event.preventDefault();

      const values = Object.values(getFormJSON());
      onChange(values);
    },
    [getFormJSON, onChange]
  );

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
        id="kit-form-id"
        name="kitForm"
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
