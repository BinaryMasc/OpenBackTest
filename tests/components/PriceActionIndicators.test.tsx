import { fireEvent, render, screen } from '@testing-library/react';
import type { Chart } from 'klinecharts';
import { expect, it, vi } from 'vitest';
import { IndicatorMenu } from '../../src/components/TradingChart/IndicatorMenu';
import { IndicatorProperties } from '../../src/components/TradingChart/IndicatorProperties';
import { useIndicators } from '../../src/hooks/useIndicators';
import { useChartStateStore } from '../../src/store/useChartStateStore';

vi.mock('klinecharts', () => ({ LineType: { Solid: 'solid' }, registerIndicator: vi.fn() }));

it('adds overlays from the menu, edits their properties, and restores both on the candle pane', () => {
  const chart = { createIndicator: vi.fn(), overrideIndicator: vi.fn(), removeIndicator: vi.fn() };
  const chartRef = { current: chart as unknown as Chart };
  function Controls() {
    const indicators = useIndicators(chartRef, { symbol: 'ES' });
    return <>
      <IndicatorMenu onAdd={indicators.addIndicator} />
      {indicators.editingInstance && <IndicatorProperties instance={indicators.editingInstance}
        onUpdate={indicators.updateInstance} onRemove={indicators.removeIndicator} onClose={() => {}} />}
    </>;
  }
  const view = render(<Controls />);
  fireEvent.click(screen.getByRole('button', { name: 'Indicators' }));
  fireEvent.click(screen.getByRole('option', { name: /Fair Value Gap/ }));
  fireEvent.change(screen.getByLabelText('Up color'), { target: { value: '#010203' } });
  fireEvent.change(screen.getByLabelText('Down color'), { target: { value: '#040506' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: /Max extension/ }), { target: { value: '12' } });
  fireEvent.click(screen.getByRole('button', { name: 'Indicators' }));
  fireEvent.click(screen.getByRole('option', { name: /Change of Character/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Show ChoCh and BoS labels/ }));
  expect(chart.overrideIndicator).toHaveBeenLastCalledWith(expect.objectContaining({ extendData: expect.objectContaining({ settings: { showLabels: false } }) }), 'candle_pane');
  fireEvent.change(screen.getByRole('spinbutton', { name: /Swing bars/ }), { target: { value: '2' } });

  view.unmount();
  chart.createIndicator.mockClear();
  render(<Controls />);
  const [gap, structure] = useChartStateStore.getState().getIndicators('chart-1', 'ES');
  expect(chart.createIndicator).toHaveBeenCalledWith(expect.objectContaining({
    name: `FVG_${gap.id}`, calcParams: [12], extendData: {
      color: '#010203', opacity: 0.3, settings: { downColor: '#040506' },
    },
  }), true, { id: 'candle_pane' });
  expect(chart.createIndicator).toHaveBeenCalledWith(expect.objectContaining({
    name: `ChoCh-BoS_${structure.id}`, calcParams: [2], extendData: expect.objectContaining({ settings: { showLabels: false } }),
  }), true, { id: 'candle_pane' });
});
