/* eslint-disable no-restricted-syntax */
/* eslint-disable jsx-a11y/no-noninteractive-tabindex */
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/* eslint-disable jsx-a11y/mouse-events-have-key-events */
/* eslint-disable react/no-array-index-key */
/* eslint-disable no-nested-ternary */
import React, { useCallback, KeyboardEvent, useEffect, useRef } from 'react';
import { UI } from '@johnlindquist/kit/core/enum';
import parse, { domToReact } from 'html-react-parser';
import { useAtom, useAtomValue } from 'jotai';

import {
  changeAtom,
  formDataAtom,
  formHTMLAtom,
  logAtom,
  previewHTMLAtom,
  submitValueAtom,
} from '../jotai';

export default function Form() {
  // useEscape();

  const formRef = useRef<HTMLFormElement>(null);
  const [formHTML] = useAtom(formHTMLAtom);
  const [formData] = useAtom(formDataAtom);
  const [, submit] = useAtom(submitValueAtom);
  const [previewHTML] = useAtom(previewHTMLAtom);
  const log = useAtomValue(logAtom);

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
    const els: any[] = Array.from((formRef?.current as any)?.elements).filter(
      (el: any) => {
        if (el.type === 'submit') return false;
        if (el.type === 'reset') return false;

        return true;
      }
    );

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

    const formJSON: any = {};
    // sort by parseInt of id
    // split the elements into two arrays: with ID and without ID
    const elsNoId = els.filter(
      (el) => !el.id || Number.isNaN(parseInt(el.id, 10))
    );
    const elsId = els.filter(
      (el) => el.id && !Number.isNaN(parseInt(el.id, 10))
    );

    // sort the elements with ID
    const sortedElsWithId = elsId.sort((a, b) => {
      const aId = parseInt(a.id, 10);
      const bId = parseInt(b.id, 10);

      return aId > bId ? 1 : -1;
    });

    // concatenate the elements without ID to the end
    const sortedEls = sortedElsWithId.concat(elsNoId);

    const orderedValues: any[] = [];

    sortedEls.forEach((el) => {
      if (el.name) {
        if (
          multis.includes(el.name) ||
          (el.tagName === 'SELECT' && el.multiple)
        ) {
          const value = data.getAll(el.name);
          orderedValues.push(value);
        } else {
          const value = data.get(el.name);
          orderedValues.push(value?.path || value);
        }
      }
    });

    els.forEach((el) => {
      if (el.name) {
        if (
          multis.includes(el.name) ||
          (el.tagName === 'SELECT' && el.multiple)
        ) {
          const value = data.getAll(el.name);
          formJSON[el.name] = value;
        } else {
          const value = data.get(el.name);
          formJSON[el.name] = value?.path || value;
        }
      }
    });

    formJSON.orderedValues = orderedValues;

    // TODO: add namedValues based on the name of the element

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

      const { orderedValues } = getFormJSON();

      onChange(orderedValues);
    },
    [getFormJSON, onChange]
  );

  return (
    <div className="flex h-full min-h-full min-w-full flex-row overflow-x-scroll">
      {/* <SimpleBar
        className="w-full h-full"
        id={UI.form}
        style={
          {
            WebkitAppRegion: 'no-drag',
            WebkitUserSelect: 'text',
          } as any
        }
      > */}
      <form
        id={UI.form}
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
      {/* </SimpleBar> */}
    </div>
  );
}
