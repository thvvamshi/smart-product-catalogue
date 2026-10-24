import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiDocsPage } from '../pages/ApiDocsPage';

afterEach(() => vi.restoreAllMocks());

describe('ApiDocsPage', () => {
  it('documents the complete verified API contract with readable examples', () => {
    render(<ApiDocsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'API Documentation' })).toBeInTheDocument();
    expect(screen.getByText('/products')).toBeInTheDocument();
    expect(screen.getByText('/products/:id')).toBeInTheDocument();
    expect(screen.getByText('/health')).toBeInTheDocument();
    expect(screen.getByText('/health/db')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(11);
    expect(screen.getByLabelText('successful product search response')).toHaveTextContent('"id": "42"');
    expect(screen.getByLabelText('successful product search response')).toHaveTextContent('"nextCursor"');
    expect(screen.getByLabelText('empty product search response')).toHaveTextContent('"hasNextPage": false');
    expect(screen.getByLabelText('follow-up product search request')).toHaveTextContent('cursor=NEXT_CURSOR_FROM_RESPONSE');
    expect(screen.getByLabelText('database seed commands')).toHaveTextContent('db:verify-count');
    expect(screen.queryByText('Requested result page.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('validation error response')).toHaveTextContent('VALIDATION_ERROR');
    expect(screen.queryByText(/your-backend\.onrender\.com/)).not.toBeInTheDocument();
  });

  it('copies an example and provides visible feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<ApiDocsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy example product search request' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('curl -G'));
    expect(screen.getByRole('button', { name: 'Copy example product search request' })).toHaveTextContent('Copied!');
  });

  it('shows failure feedback when clipboard access fails', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    render(<ApiDocsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy product details request' }));
    expect(screen.getByRole('button', { name: 'Copy product details request' })).toHaveTextContent('Copy failed');
  });
});
