import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DrawingToolbar } from '../../src/components/TradingChart/DrawingToolbar';

describe('DrawingToolbar', () => {
  it('exposes the TradingView-style trade-position drawing tool', () => {
    const onToolClick = vi.fn();

    render(
      <DrawingToolbar
        activeTool={null}
        onToolClick={onToolClick}
        onClear={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        canUndo={false}
        canRedo={false}
        showIndicatorsMenu={false}
        onToggleIndicatorsMenu={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Trade position' }));
    expect(onToolClick).toHaveBeenCalledWith('trade');
  });
});
