import { CHART_CONTAINER_ID } from '../../lib/chart/constants';
import { useChartStyleStore } from '../../store/useChartStyleStore';

interface ChartContainerProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function ChartContainer({ containerRef }: ChartContainerProps) {
  const backgroundColor = useChartStyleStore(state => state.backgroundColor);

  return (
    <div
      id={CHART_CONTAINER_ID}
      className="absolute inset-0"
      ref={containerRef}
      style={{ backgroundColor }}
    />
  );
}
