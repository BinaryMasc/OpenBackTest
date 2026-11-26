import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { IndicatorLegend } from '../../src/components/TradingChart/IndicatorLegend';

it('collapses and expands the list independently of indicator visibility', () => {
  const onSelect = vi.fn();
  const onToggleVisibility = vi.fn();
  const common = { calcParams: [3], opacity: 0.5, color: '#ffffff', paneId: 'candle_pane' };
  render(<IndicatorLegend instances={[
    { ...common, id: 'a', name: 'EMA', visible: true },
    { ...common, id: 'b', name: 'ATR', visible: false },
  ]} onSelect={onSelect} onToggleVisibility={onToggleVisibility} onRemove={vi.fn()} />);
  const toggle = screen.getByRole('button', { name: 'Collapse indicator list' });
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('list')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Expand indicator list' }));
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  expect(onToggleVisibility).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /ATR/ }));
  expect(onSelect).toHaveBeenCalledWith('b');
});
