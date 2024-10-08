import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import React from 'react';

const SampleComponent = () => <div>Hello, Renderer!</div>;

describe('Renderer Process', () => {
  it('renders the sample component', () => {
    render(<SampleComponent />);
    expect(screen.getByText('Hello, Renderer!')).toBeInTheDocument();
  });
});
