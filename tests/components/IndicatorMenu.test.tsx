import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IndicatorMenu } from '../../src/components/TradingChart/IndicatorMenu';

function openPicker() {
  const onAdd = vi.fn();
  render(<IndicatorMenu onAdd={onAdd} />);
  const trigger = screen.getByRole('button', { name: 'Indicators' });
  fireEvent.click(trigger);
  const search = screen.getByRole('combobox', { name: 'Search indicators' });
  return { trigger, search, onAdd };
}

describe('indicator search', () => {
  it('focuses search and matches registered codes and names regardless of case or spacing', () => {
    const { search, onAdd } = openPicker();
    expect(search).toHaveFocus();
    for (const [query, name] of [
      ['  fair   GAP ', 'FVG'], ['BoS', 'ChoCh-BoS'], ['exponential moving average', 'EMA'],
      ['weighted price', 'AVWAP'], ['convergence divergence', 'MACD'],
    ]) {
      fireEvent.change(search, { target: { value: query } });
      expect(screen.getAllByRole('option')).toHaveLength(1);
      expect(screen.getByRole('option')).toHaveTextContent(name);
    }

    fireEvent.change(search, { target: { value: '  aVp ' } });
    fireEvent.click(screen.getByRole('option'));
    expect(onAdd).toHaveBeenCalledExactlyOnceWith('AVP');
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('navigates only matching indicators, adds with Enter, and starts fresh on reopening', () => {
    const { trigger, search, onAdd } = openPicker();
    fireEvent.change(search, { target: { value: 'profile' } });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    fireEvent.keyDown(search, { key: 'ArrowUp' });
    expect(search).toHaveAttribute('aria-activedescendant', options[1].id);
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(search).toHaveAttribute('aria-activedescendant', options[0].id);
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledExactlyOnceWith('AVP');
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(screen.getAllByRole('option').length).toBeGreaterThan(2);
  });

  it('handles no matches, dismisses with Escape, the trigger, and outside presses', () => {
    const { trigger, search, onAdd } = openPicker();
    fireEvent.change(search, { target: { value: 'whatever' } });
    expect(screen.getByRole('status')).toHaveTextContent('No matching indicators');
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(onAdd).not.toHaveBeenCalled();
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
