/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable react/no-danger */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable react/destructuring-assignment */
import { useAtom } from 'jotai';
import React, { RefObject, useCallback, useEffect, useRef } from 'react';
import { darkAtom, inputFocusAtom, previewHTMLAtom } from '../jotai';

export default function Preview() {
  const highlightRef: RefObject<any> = useRef(null);
  const [previewHTML] = useAtom(previewHTMLAtom);
  const [, setInputFocus] = useAtom(inputFocusAtom);
  const [isDark] = useAtom(darkAtom);

  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollTop = 0;
      highlightRef.current.scrollLeft = 0;
    }
  }, [previewHTML]);

  const onMouseEnter = useCallback(() => {
    setInputFocus(false);
  }, [setInputFocus]);

  const onMouseLeave = useCallback(() => {
    setInputFocus(true);
  }, [setInputFocus]);

  return (
    <div
      className="overflow-scroll w-full h-full"
      style={{ userSelect: 'text' }}
      // onMouseUp={onMouseUp}
      ref={highlightRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <style type="text/css">{isDark ? darkTheme : lightTheme}</style>
      {previewHTML && (
        <div
          className="w-full h-full"
          dangerouslySetInnerHTML={{ __html: previewHTML }}
        />
      )}
    </div>
  );
}

const darkTheme = `
/*

Night Owl for highlight.js (c) Carl Baxter <carl@cbax.tech>

An adaptation of Sarah Drasner's Night Owl VS Code Theme
https://github.com/sdras/night-owl-vscode-theme

Copyright (c) 2018 Sarah Drasner

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/

.hljs {
  display: block;
  overflow-x: auto;
  padding: 0.5em;
  background: rgba(0, 0, 0, .25);
  color: #d6deeb;
}

/* General Purpose */
.hljs-keyword {
  color: #c792ea;
  font-style: italic;
}
.hljs-built_in {
  color: #addb67;
  font-style: italic;
}
.hljs-type {
  color: #82aaff;
}
.hljs-literal {
  color: #ff5874;
}
.hljs-number {
  color: #F78C6C;
}
.hljs-regexp {
  color: #5ca7e4;
}
.hljs-string {
  color: #ecc48d;
}
.hljs-subst {
  color: #d3423e;
}
.hljs-symbol {
  color: #82aaff;
}
.hljs-class {
  color: #ffcb8b;
}
.hljs-function {
  color: #82AAFF;
}
.hljs-title {
  color: #DCDCAA;
  font-style: italic;
}
.hljs-params {
  color: #7fdbca;
}

/* Meta */
.hljs-comment {
  color: #637777;
  font-style: italic;
}
.hljs-doctag {
  color: #7fdbca;
}
.hljs-meta {
  color: #82aaff;
}
.hljs-meta-keyword {
  color: #82aaff;
}
.hljs-meta-string {
  color: #ecc48d;
}

/* Tags, attributes, config */
.hljs-section {
  color: #82b1ff;
}
.hljs-tag,
.hljs-name,
.hljs-builtin-name {
  color: #7fdbca;
}
.hljs-attr {
  color: #7fdbca;
}
.hljs-attribute {
  color: #80cbc4;
}
.hljs-variable {
  color: #addb67;
}

/* Markup */
.hljs-bullet {
  color: #d9f5dd;
}
.hljs-code {
  color: #80CBC4;
}
.hljs-emphasis {
  color: #c792ea;
  font-style: italic;
}
.hljs-strong {
  color: #addb67;
  font-weight: bold;
}
.hljs-formula {
  color: #c792ea;
}
.hljs-link {
  color: #ff869a;
}
.hljs-quote {
  color: #697098;
  font-style: italic;
}

/* CSS */
.hljs-selector-tag {
  color: #ff6363;
}

.hljs-selector-id {
  color: #fad430;
}

.hljs-selector-class {
  color: #addb67;
  font-style: italic;
}

.hljs-selector-attr,
.hljs-selector-pseudo {
  color: #c792ea;
  font-style: italic;
}

/* Templates */
.hljs-template-tag {
  color: #c792ea;
}
.hljs-template-variable {
  color: #addb67;
}

/* diff */
.hljs-addition {
  color: #addb67ff;
  font-style: italic;
}

.hljs-deletion {
  color: #EF535090;
  font-style: italic;
}
`;

const lightTheme = `
/**
 * GitHub Gist Theme
 * Author : Anthony Attard - https://github.com/AnthonyAttard
 * Author : Louis Barranqueiro - https://github.com/LouisBarranqueiro
 */

.hljs {
  display: block;
  background: rgba(255, 255, 255, .25);
  padding: 0.5em;
  color: #333333;
  overflow-x: auto;
}

.hljs-comment,
.hljs-meta {
  color: #969896;
}

.hljs-variable,
.hljs-template-variable,
.hljs-strong,
.hljs-emphasis,
.hljs-quote {
  color: #df5000;
}

.hljs-keyword,
.hljs-selector-tag,
.hljs-type {
  color: #d73a49;
}

.hljs-literal,
.hljs-symbol,
.hljs-bullet,
.hljs-attribute {
  color: #0086b3;
}

.hljs-section,
.hljs-name {
  color: #63a35c;
}

.hljs-tag {
  color: #333333;
}

.hljs-title,
.hljs-attr,
.hljs-selector-id,
.hljs-selector-class,
.hljs-selector-attr,
.hljs-selector-pseudo {
  color: #6f42c1;
}

.hljs-addition {
  color: #55a532;
  background-color: #eaffea;
}

.hljs-deletion {
  color: #bd2c00;
  background-color: #ffecec;
}

.hljs-link {
  text-decoration: underline;
}

.hljs-number {
  color: #005cc5;
}

.hljs-string {
  color: #032f62;
}

`;
