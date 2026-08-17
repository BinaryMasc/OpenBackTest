import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChartContainer } from '../../src/components/TradingChart/ChartContainer';

describe('ChartContainer loading state', () => {
  it('shows an accessible loading indicator over the chart', () => {
    const containerRef = { current: null } as React.RefObject<HTMLDivElement | null>;
    render(
      <ChartContainer
        id="chart-loading-test"
        containerRef={containerRef}
        isLoading
      />
    );

    expect(screen.getByRole('status', { name: 'Loading market data' })).toBeInTheDocument();
    expect(screen.getByText('Loading market data')).toBeInTheDocument();
  });

  it('does not render the loading indicator when data is ready', () => {
    const containerRef = { current: null } as React.RefObject<HTMLDivElement | null>;
    render(<ChartContainer id="chart-ready-test" containerRef={containerRef} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
