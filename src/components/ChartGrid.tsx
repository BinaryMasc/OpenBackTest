import { useBacktestStore } from '../store/useBacktestStore';
import { TradingChart } from './TradingChart';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import React from 'react';

export function ChartGrid() {
  const charts = useBacktestStore(state => state.charts);

  return (
    <div className="w-full h-full p-1 bg-dark-900">
      <PanelGroup orientation="horizontal" className="w-full h-full">
        {charts.map((chart, index) => (
          <React.Fragment key={chart.id}>
            <Panel minSize={20} className="w-full h-full min-h-0 border border-dark-700 rounded-xl overflow-hidden shadow-2xl relative">
              <TradingChart id={chart.id} timeframe={chart.timeframe} />
            </Panel>
            {index < charts.length - 1 && (
              <PanelResizeHandle className="w-2 mx-0.5 rounded flex items-center justify-center transition-colors hover:bg-dark-700 group cursor-col-resize">
                <div className="w-0.5 h-8 bg-dark-600 group-hover:bg-primary-500 rounded-full transition-colors" />
              </PanelResizeHandle>
            )}
          </React.Fragment>
        ))}
      </PanelGroup>
    </div>
  );
}
