import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LinkEditorPanel } from '../LinkEditorPanel';

describe('LinkEditorPanel', () => {
  it('renders input with value and placeholder', () => {
    render(
      <LinkEditorPanel
        open={true}
        position={{ top: 100, left: 100 }}
        value="https://qoe.fi"
        onChange={vi.fn()}
        onApply={vi.fn()}
        onRemove={vi.fn()}
        onClose={vi.fn()}
        canRemove={false}
      />
    );

    const input = screen.getByRole('textbox');
    expect(input).toHaveValue('https://qoe.fi');
    expect(screen.getByText(/⌘K/i)).toBeInTheDocument();
  });

  it('displays field error and sets aria-describedby', () => {
    render(
      <LinkEditorPanel
        open={true}
        position={{ top: 100, left: 100 }}
        value="bad-link"
        onChange={vi.fn()}
        onApply={vi.fn()}
        onRemove={vi.fn()}
        onClose={vi.fn()}
        canRemove={false}
        error="URL invalide"
      />
    );

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-describedby', 'link-url-error');
    expect(screen.getByText('URL invalide')).toBeInTheDocument();
  });

  it('calls onChange when user types', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <LinkEditorPanel
        open={true}
        position={{ top: 100, left: 100 }}
        value=""
        onChange={onChange}
        onApply={vi.fn()}
        onRemove={vi.fn()}
        onClose={vi.fn()}
        canRemove={false}
      />
    );

    const input = screen.getByRole('textbox');
    await user.type(input, 'https://example.com');
    expect(onChange).toHaveBeenCalled();
  });

  it('calls onApply on button click or Enter keypress', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    render(
      <LinkEditorPanel
        open={true}
        position={{ top: 100, left: 100 }}
        value="https://qoe.fi"
        onChange={vi.fn()}
        onApply={onApply}
        onRemove={vi.fn()}
        onClose={vi.fn()}
        canRemove={false}
      />
    );

    await user.click(screen.getByRole('button', { name: /Appliquer/i }));
    expect(onApply).toHaveBeenCalledTimes(1);

    const input = screen.getByRole('textbox');
    await user.type(input, '{Enter}');
    expect(onApply).toHaveBeenCalledTimes(2);
  });

  it('renders and calls onRemove when canRemove is true', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();

    render(
      <LinkEditorPanel
        open={true}
        position={{ top: 100, left: 100 }}
        value="https://qoe.fi"
        onChange={vi.fn()}
        onApply={vi.fn()}
        onRemove={onRemove}
        onClose={vi.fn()}
        canRemove={true}
      />
    );

    const removeBtn = screen.getByRole('button', { name: /Retirer le lien/i });
    expect(removeBtn).toBeInTheDocument();
    await user.click(removeBtn);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when clicking cancel or close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <LinkEditorPanel
        open={true}
        position={{ top: 100, left: 100 }}
        value="https://qoe.fi"
        onChange={vi.fn()}
        onApply={vi.fn()}
        onRemove={vi.fn()}
        onClose={onClose}
        canRemove={false}
      />
    );

    await user.click(screen.getByRole('button', { name: /Annuler/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /Fermer/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
