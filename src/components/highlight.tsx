/* eslint-disable react/no-danger */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-underscore-dangle */
import hljs from 'highlight.js';
import React from 'react';

export default function Hightlight({ html = '' }) {
  const __html = hljs.highlightAuto(html).value;

  return (
    <pre>
      <code>
        <div dangerouslySetInnerHTML={{ __html }} />
      </code>
    </pre>
  );
}
