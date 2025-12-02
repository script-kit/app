import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

const SampleComponent = () => <div>Hello, Renderer!</div>;

describe('Renderer Process', () => {
  it('renders the sample component', () => {
    render(<SampleComponent />);
    expect(screen.getByText('Hello, Renderer!')).toBeInTheDocument();
  });
});
