import { CHART_CONTAINER_ID } from '../../lib/chart/constants';

interface ChartContainerProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function ChartContainer({ containerRef }: ChartContainerProps) {
  return (
    <div id={CHART_CONTAINER_ID} className="absolute inset-0" ref={containerRef} />
  );
}
