import { useState, useCallback } from 'react';
import type { Chart } from 'klinecharts';
import { DEFAULT_INDICATOR_PARAMS, INDICATORS_LIST } from '../lib/chart/constants';
import { getPaneId } from '../lib/chart/utils';

export function useIndicators(chartRef: React.RefObject<Chart | null>) {
  const chart = chartRef.current;
  const [showIndicatorsMenu, setShowIndicatorsMenu] = useState(false);
  const [activeIndicators, setActiveIndicators] = useState<string[]>([]);
  const [indicatorParams, setIndicatorParams] = useState<Record<string, number[]>>({
    ...DEFAULT_INDICATOR_PARAMS,
  });

  const toggleIndicator = useCallback(
    (name: string) => {
      const paneId = getPaneId(name);
      if (activeIndicators.includes(name)) {
        chart?.removeIndicator(name, paneId);
        setActiveIndicators(prev => prev.filter(i => i !== name));
      } else {
        chart?.createIndicator({ name, calcParams: indicatorParams[name] }, false, { id: paneId });
        setActiveIndicators(prev => [...prev, name]);
      }
    },
    [chart, activeIndicators, indicatorParams]
  );

  const updateIndicatorParam = useCallback(
    (name: string, index: number, value: number) => {
      const newParams = [...(indicatorParams[name] || [])];
      newParams[index] = value;
      setIndicatorParams(prev => ({ ...prev, [name]: newParams }));
      if (activeIndicators.includes(name)) {
        chart?.overrideIndicator({ name, calcParams: newParams }, getPaneId(name));
      }
    },
    [chart, indicatorParams, activeIndicators]
  );

  return {
    indicatorsList: INDICATORS_LIST,
    activeIndicators,
    toggleIndicator,
    indicatorParams,
    updateIndicatorParam,
    showIndicatorsMenu,
    setShowIndicatorsMenu,
  };
}
