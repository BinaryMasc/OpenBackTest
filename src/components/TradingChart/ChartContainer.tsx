import { useChartStyleStore } from '../../store/useChartStyleStore';

interface ChartContainerProps {
  id: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function ChartContainer({ id, containerRef }: ChartContainerProps) {
  const backgroundColor = useChartStyleStore(state => state.backgroundColor);

  return (
    <div
      id={id}
      className="absolute inset-0"
      ref={containerRef}
      style={{ backgroundColor }}
    />
  );
}
