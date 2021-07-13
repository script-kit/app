/* eslint-disable no-restricted-syntax */
/* eslint-disable jsx-a11y/no-noninteractive-tabindex */
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/* eslint-disable jsx-a11y/mouse-events-have-key-events */
/* eslint-disable react/no-array-index-key */
/* eslint-disable no-nested-ternary */
import React, {
  useCallback,
  useRef,
  KeyboardEvent,
  useEffect,
  RefObject,
} from 'react';
import parse, { attributesToProps, domToReact } from 'html-react-parser';
import SimpleBar from 'simplebar-react';
import { useAtom } from 'jotai';
import { formDataAtom, formHTMLAtom, pidAtom } from '../jotai';

type FormProps = {
  width: number;
  height: number;
  onSubmit: (value: any) => void;
  onEscape: (value: any) => void;
  onFormHeightChanged: (value: number) => void;
};

const MIN_FORM_HEIGHT = 180;

export default function Form({
  width,
  height,
  onSubmit,
  onEscape,
  onFormHeightChanged,
}: FormProps) {
  const containerRef: RefObject<any> = useRef(null);
  const formRef = useRef<any>();
  const [formHTML] = useAtom(formHTMLAtom);
  const [formData] = useAtom(formDataAtom);

  useEffect(() => {
    if (containerRef?.current?.firstElementChild) {
      const clientHeight =
        containerRef?.current?.firstElementChild?.clientHeight;
      const formHeight =
        clientHeight < MIN_FORM_HEIGHT ? MIN_FORM_HEIGHT : clientHeight;

      onFormHeightChanged(formHeight);

      if (formRef?.current?.elements?.[0]) {
        formRef?.current?.elements?.[0]?.focus();
      } else {
        formRef?.current?.focus();
      }
    }
  }, [
    onFormHeightChanged,
    formRef?.current?.firstElementChild,
    formRef?.current?.elements,
  ]);

  useEffect(() => {
    if (formData) {
      const data: any = formData;
      for (const el of formRef?.current?.elements) {
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

      onSubmit(formJSON);
    },
    [onSubmit]
  );

  const onFormKeyDown = useCallback(
    (event: KeyboardEvent<HTMLFormElement>) => {
      if (event.key === 'Escape') {
        onEscape(event);
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case 's':
          case 'Enter':
            event.preventDefault();
            onLocalSubmit(event);
            break;

          case 'w':
            event.preventDefault();
            onEscape(event);
            break;

          default:
            break;
        }
      }
    },
    [onEscape, onLocalSubmit]
  );

  const onFormChange = useCallback(() => {}, []);

  return (
    <SimpleBar
      scrollableNodeProps={{ ref: containerRef }}
      style={
        {
          WebkitAppRegion: 'no-drag',
          WebkitUserSelect: 'text',
          width,
          height,
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
