/* eslint-disable react/destructuring-assignment */
import React from 'react';
import parse from 'html-react-parser';

interface PreviewProps {
  preview: string;
}

class PreviewBoundary extends React.Component {
  // eslint-disable-next-line react/state-in-constructor
  public state: { hasError: boolean } = { hasError: false };

  render() {
    // eslint-disable-next-line react/destructuring-assignment
    if (this.state.hasError) {
      // You can render any custom fallback UI
      return <h1>Preview not available</h1>;
    }
    // eslint-disable-next-line react/destructuring-assignment
    // eslint-disable-next-line react/prop-types
    return this.props.children;
  }
}

export default function Preview({ preview }: PreviewProps) {
  return (
    <div className="flex-1">
      <PreviewBoundary>{parse(preview as string)} </PreviewBoundary>
    </div>
  );
}
