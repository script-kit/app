export const darkTheme = `
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

export const lightTheme = `/*!
Theme: StackOverflow Light
Description: Light theme as used on stackoverflow.com
Author: stackoverflow.com
Maintainer: @Hirse
Website: https://github.com/StackExchange/Stacks
License: MIT
Updated: 2021-05-15

Updated for @stackoverflow/stacks v0.64.0
Code Blocks: /blob/v0.64.0/lib/css/components/_stacks-code-blocks.less
Colors: /blob/v0.64.0/lib/css/exports/_stacks-constants-colors.less
*/

.hljs {
/* var(--highlight-color) */
color: #2f3337;
/* var(--highlight-bg) */
background: #f6f6f6;
}

.hljs-subst {
/* var(--highlight-color) */
color: #2f3337;
}

.hljs-comment {
/* var(--highlight-comment) */
color: #656e77;
}

.hljs-keyword,
.hljs-selector-tag,
.hljs-meta .hljs-keyword,
.hljs-doctag,
.hljs-section {
/* var(--highlight-keyword) */
color: #015692;
}

.hljs-attr {
/* var(--highlight-attribute); */
color: #015692;
}

.hljs-attribute {
/* var(--highlight-symbol) */
color: #803378;
}

.hljs-name,
.hljs-type,
.hljs-number,
.hljs-selector-id,
.hljs-quote,
.hljs-template-tag {
/* var(--highlight-namespace) */
color: #b75501;
}

.hljs-selector-class {
/* var(--highlight-keyword) */
color: #015692;
}

.hljs-string,
.hljs-regexp,
.hljs-symbol,
.hljs-variable,
.hljs-template-variable,
.hljs-link,
.hljs-selector-attr {
/* var(--highlight-variable) */
color: #54790d;
}

.hljs-meta,
.hljs-selector-pseudo {
/* var(--highlight-keyword) */
color: #015692;
}

.hljs-built_in,
.hljs-title,
.hljs-literal {
/* var(--highlight-literal) */
color: #b75501;
}

.hljs-bullet,
.hljs-code {
/* var(--highlight-punctuation) */
color: #535a60;
}

.hljs-meta .hljs-string {
/* var(--highlight-variable) */
color: #54790d;
}

.hljs-deletion {
/* var(--highlight-deletion) */
color: #c02d2e;
}

.hljs-addition {
/* var(--highlight-addition) */
color: #2f6f44;
}

.hljs-emphasis {
font-style: italic;
}

.hljs-strong {
font-weight: bold;
}

.hljs-formula,
.hljs-operator,
.hljs-params,
.hljs-property,
.hljs-punctuation,
.hljs-tag {
/* purposely ignored */
}`;
