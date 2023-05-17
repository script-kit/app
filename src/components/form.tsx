/* eslint-disable no-restricted-syntax */
/* eslint-disable jsx-a11y/no-noninteractive-tabindex */
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/* eslint-disable jsx-a11y/mouse-events-have-key-events */
/* eslint-disable react/no-array-index-key */
/* eslint-disable no-nested-ternary */
import React, { useCallback, KeyboardEvent, useEffect } from 'react';
import { UI } from '@johnlindquist/kit/cjs/enum';
import parse, { domToReact } from 'html-react-parser';
import SimpleBar from 'simplebar-react';
import { useAtom, useAtomValue } from 'jotai';

import {
  changeAtom,
  closedDiv,
  formDataAtom,
  formHTMLAtom,
  previewHTMLAtom,
  submitValueAtom,
} from '../jotai';
import { useObserveMainHeight } from '../hooks';

export default function Form() {
  // useEscape();

  const formRef = useObserveMainHeight<HTMLFormElement>('.wrapper > div');
  const [formHTML] = useAtom(formHTMLAtom);
  const [formData] = useAtom(formDataAtom);
  const [, submit] = useAtom(submitValueAtom);
  const [previewHTML] = useAtom(previewHTMLAtom);

  const hasPreview = Boolean(previewHTML && previewHTML !== closedDiv);

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

    const formJSON: any = {};
    // sort by parseInt of id
    const sortedEls = els
      .filter((el) => {
        // ed.id is a string
        // eslint-disable-next-line no-restricted-globals
        if (el.id && !isNaN(parseInt(el.id, 10))) {
          return true;
        }
        return false;
      })
      .sort((a, b) => {
        const aId = parseInt(a.id, 10);
        const bId = parseInt(b.id, 10);

        return aId > bId ? 1 : -1;
      });

    const orderedValues: any[] = [];

    sortedEls.forEach((el) => {
      if (el.name) {
        if (multis.includes(el.name)) {
          const value = data.getAll(el.name);
          formJSON[el.name] = value;
          orderedValues.push(value);
        } else {
          const value = data.get(el.name);
          formJSON[el.name] = value?.path || value;
          orderedValues.push(value?.path || value);
        }
      }
    });

    formJSON.orderedValues = orderedValues;

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
    <div className="flex flex-row h-full min-w-full min-h-full overflow-x-scroll">
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
