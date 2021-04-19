import React from 'react';
import parse from 'html-react-parser';

interface PreviewProps {
  preview: string;
}

export default function Preview({ preview }: PreviewProps) {
  return <div className="flex-1">{parse(preview as string)}</div>;
}
