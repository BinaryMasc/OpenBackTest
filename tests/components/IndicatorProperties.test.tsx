import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IndicatorProperties } from '../../src/components/TradingChart/IndicatorProperties';
import type { IndicatorInstance } from '../../src/types/indicatorTypes';

function openProperties(name: string, calcParams: number[]) {
  const instance: IndicatorInstance = {
    id: 'example', name, calcParams, color: '#ffffff', opacity: 0.5, visible: true, paneId: 'candle_pane',
  };
  const onUpdate = vi.fn();
  const onClose = vi.fn();
  const onRemove = vi.fn();
  render(<IndicatorProperties instance={instance} onUpdate={onUpdate} onClose={onClose} onRemove={onRemove} />);
  return { onUpdate, onRemove, onClose };
}

describe('indicator properties', () => {
  it.each([
    { prefix: [1700000000000, 1700003600000], expectedFields: 3 },
    { prefix: [75], expectedFields: 4 },
  ])('keeps the AVP anchor $prefix when editing and resetting profile parameters', ({ prefix, expectedFields }) => {
    const { onUpdate } = openProperties('AVP', [...prefix, 60, 15, 80]);
    expect(screen.getAllByRole('spinbutton')).toHaveLength(expectedFields);
    if (prefix.length === 1) expect(screen.getByLabelText('Lookback (bars)')).toHaveValue(75);
    fireEvent.change(screen.getByLabelText('Width %'), { target: { value: '20' } });
    expect(onUpdate).toHaveBeenLastCalledWith('example', { calcParams: [...prefix, 60, 20, 80] });
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(onUpdate).toHaveBeenLastCalledWith('example', { calcParams: [...prefix, 120, 30, 70] });
  });

  it('keeps anchored VWAP timestamps out of the form', () => {
    openProperties('AVWAP', [1700000000000, 1700003600000]);
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset to defaults' })).toBeNull();
  });

  it('edits native parameters and routes the common editor controls to the selected instance', () => {
    const { onUpdate, onRemove, onClose } = openProperties('MACD', [8, 20, 7]);
    fireEvent.change(screen.getByLabelText('Slow'), { target: { value: '24' } });
    expect(onUpdate).toHaveBeenLastCalledWith('example', { calcParams: [8, 24, 7] });
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(onUpdate).toHaveBeenLastCalledWith('example', { calcParams: [12, 26, 9] });
    fireEvent.change(screen.getByRole('slider', { name: /Opacity/ }), { target: { value: '0.7' } });
    expect(onUpdate).toHaveBeenLastCalledWith('example', { opacity: 0.7 });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Indicator' }));
    expect(onRemove).toHaveBeenCalledWith('example');
    fireEvent.click(screen.getByRole('button', { name: 'Close indicator properties' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('applies the FVG integer and minimum rules and accepts zero', () => {
    const { onUpdate } = openProperties('FVG', [5]);
    const limit = screen.getByRole('spinbutton', { name: 'Max extension (bars)' });
    fireEvent.change(limit, { target: { value: '-1' } });
    fireEvent.change(limit, { target: { value: '2.5' } });
    expect(onUpdate).not.toHaveBeenCalled();
    fireEvent.change(limit, { target: { value: '0' } });
    expect(onUpdate).toHaveBeenCalledWith('example', { calcParams: [0] });
  });
});

it('edits projection timeframe, placement, and colors independently', () => {
  const { onUpdate } = openProperties('HTF Candle', [86400, 3, 4]);
  fireEvent.change(screen.getByLabelText('Higher timeframe'), { target: { value: '14400' } });
  expect(onUpdate).toHaveBeenLastCalledWith('example', { calcParams: [14400, 3, 4] });
  fireEvent.change(screen.getByLabelText('Offset (chart bars)'), { target: { value: '8' } });
  expect(onUpdate).toHaveBeenLastCalledWith('example', { calcParams: [86400, 3, 8] });
  fireEvent.change(screen.getByLabelText('Down body'), { target: { value: '#321123' } });
  expect(onUpdate).toHaveBeenLastCalledWith('example', { settings: { downColor: '#321123' } });
});
