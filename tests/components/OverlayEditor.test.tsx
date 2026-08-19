import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OverlayEditor } from '../../src/components/TradingChart/OverlayEditor';
import type { Chart, Overlay } from 'klinecharts';

describe('OverlayEditor', () => {
  const mockOnColorChange = vi.fn();
  const mockOnOpacityChange = vi.fn();
  const mockOnFontSizeChange = vi.fn();
  const mockOnRemove = vi.fn();
  const mockOnClose = vi.fn();
  const mockOverrideOverlay = vi.fn();

  const mockChartRef = {
    current: {
      overrideOverlay: mockOverrideOverlay,
    } as unknown as Chart,
  };

  const mockOverlay: Overlay = {
    id: 'overlay-123',
    name: 'segment',
    groupId: 'drawing',
    points: [],
    styles: {},
  };

  const defaultProps = {
    overlay: mockOverlay,
    overlayColor: '#ffffff',
    overlayOpacity: 0.5,
    overlayFontSize: 12,
    onColorChange: mockOnColorChange,
    onOpacityChange: mockOnOpacityChange,
    onFontSizeChange: mockOnFontSizeChange,
    onRemove: mockOnRemove,
    onClose: mockOnClose,
    chartRef: mockChartRef,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly with object properties', () => {
    render(<OverlayEditor {...defaultProps} />);
    expect(screen.getByText('Object Properties')).toBeInTheDocument();
    expect(screen.getByText('Remove Drawing')).toBeInTheDocument();
  });

  it('changes color and updates chart overlay', () => {
    render(<OverlayEditor {...defaultProps} />);
    
    // Find the color input by its display type or role (actually there is no explicit label wrapping the input cleanly, so we can use container search or query by type)
    const colorInput = document.querySelector('input[type="color"]') as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: '#ff0000' } });

    expect(mockOnColorChange).toHaveBeenCalledWith('#ff0000');
    expect(mockOverrideOverlay).toHaveBeenCalledWith(expect.objectContaining({
      id: 'overlay-123',
      styles: expect.any(Object), // It should update lines and polygon colors
    }));
  });

  it('changes opacity and updates chart overlay', () => {
    render(<OverlayEditor {...defaultProps} />);
    
    const rangeInput = document.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.change(rangeInput, { target: { value: '0.8' } });

    expect(mockOnOpacityChange).toHaveBeenCalledWith(0.8);
    expect(mockOverrideOverlay).toHaveBeenCalled();
  });

  it('handles remove click', () => {
    render(<OverlayEditor {...defaultProps} />);
    
    fireEvent.click(screen.getByText('Remove Drawing'));
    expect(mockOnRemove).toHaveBeenCalled();
  });

  it('shows text content inputs if overlay is a text object', () => {
    const textOverlay = { ...mockOverlay, name: 'text', extendData: 'Hello World' };
    render(<OverlayEditor {...defaultProps} overlay={textOverlay} />);
    
    expect(screen.getByText('Text Content')).toBeInTheDocument();
    
    const textInput = screen.getByDisplayValue('Hello World');
    fireEvent.change(textInput, { target: { value: 'New Text' } });
    
    expect(mockOverrideOverlay).toHaveBeenCalledWith(expect.objectContaining({
      id: 'overlay-123',
      extendData: 'New Text',
    }));
  });

  it('keeps trade-position zone colors semantic instead of exposing a generic color picker', () => {
    const tradeOverlay = { ...mockOverlay, name: 'trade' };
    render(<OverlayEditor {...defaultProps} overlay={tradeOverlay} />);

    expect(screen.getByText('Profit and loss zones use fixed green and red colors.')).toBeInTheDocument();
    expect(document.querySelector('input[type="color"]')).not.toBeInTheDocument();
    expect(document.querySelector('input[type="range"]')).not.toBeInTheDocument();
  });

  it('handles close button click', () => {
    render(<OverlayEditor {...defaultProps} />);
    // The close button has an X icon inside, we can find it by looking for the closest button
    const closeBtn = document.querySelector('button.text-slate-400') as HTMLButtonElement;
    fireEvent.click(closeBtn);
    expect(mockOnClose).toHaveBeenCalled();
  });
});
