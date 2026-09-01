import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDrawingTools } from '../../src/hooks/useDrawingTools';
import type { Chart } from 'klinecharts';

describe('useDrawingTools', () => {
  const onOverlayCreated = vi.fn();
  const onOverlaySelected = vi.fn();
  let mockChart: any;
  let chartRef: any;
  let containerRef: any;
  let containerElement: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockChart = {
      createOverlay: vi.fn().mockReturnValue('overlay-123'),
      overrideOverlay: vi.fn(),
      getOverlayById: vi.fn().mockReturnValue({ id: 'overlay-123' }),
      getDataList: vi.fn().mockReturnValue([]),
      setScrollEnabled: vi.fn(),
      convertFromPixel: vi.fn().mockReturnValue([{ x: 10, y: 10, dataIndex: 1, value: 500 }]),
    };
    chartRef = { current: mockChart as unknown as Chart };

    // Fake DOM container for events
    containerElement = {
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    containerRef = { current: containerElement as unknown as HTMLDivElement };
  });

  it('should initialize with no active tool', () => {
    const { result } = renderHook(() => useDrawingTools({
      chartRef,
      containerRef,
      overlayColor: '#ffffff',
      overlayOpacity: 1,
      overlayFontSize: 12,
      onOverlayCreated,
      onOverlaySelected,
    }));

    expect(result.current.activeTool).toBeNull();
  });

  it('should set active tool and create overlay on click for non-pencil tools', () => {
    const { result } = renderHook(() => useDrawingTools({
      chartRef,
      containerRef,
      overlayColor: '#ffffff',
      overlayOpacity: 1,
      overlayFontSize: 12,
      onOverlayCreated,
      onOverlaySelected,
    }));

    act(() => {
      result.current.handleToolClick('segment');
    });

    expect(result.current.activeTool).toBe('segment');
    expect(mockChart.createOverlay).toHaveBeenCalledTimes(1);
    const callArg = mockChart.createOverlay.mock.calls[0][0];
    expect(callArg.name).toBe('segment');
  });

  it('should toggle active tool off if clicked again', () => {
    const { result } = renderHook(() => useDrawingTools({
      chartRef,
      containerRef,
      overlayColor: '#ffffff',
      overlayOpacity: 1,
      overlayFontSize: 12,
      onOverlayCreated,
      onOverlaySelected,
    }));

    act(() => {
      result.current.handleToolClick('rayLine');
    });
    expect(result.current.activeTool).toBe('rayLine');

    act(() => {
      result.current.handleToolClick('rayLine');
    });
    expect(result.current.activeTool).toBeNull();
  });

  it('creates the three-click trade-position overlay', () => {
    const { result } = renderHook(() => useDrawingTools({
      chartRef,
      containerRef,
      overlayColor: '#ffffff',
      overlayOpacity: 1,
      overlayFontSize: 12,
      onOverlayCreated,
      onOverlaySelected,
    }));

    act(() => {
      result.current.handleToolClick('trade');
    });

    expect(result.current.activeTool).toBe('trade');
    expect(mockChart.createOverlay).toHaveBeenCalledWith(expect.objectContaining({
      name: 'trade',
      groupId: 'drawing_group',
    }));
  });

  it('should bind mouse events for pencil tool', () => {
    const { result } = renderHook(() => useDrawingTools({
      chartRef,
      containerRef,
      overlayColor: '#ffffff',
      overlayOpacity: 1,
      overlayFontSize: 12,
      onOverlayCreated,
      onOverlaySelected,
    }));

    act(() => {
      result.current.handleToolClick('pencil');
    });

    expect(result.current.activeTool).toBe('pencil');
    // For pencil, it shouldn't call createOverlay immediately, only on mousedown
    expect(mockChart.createOverlay).not.toHaveBeenCalled();

    // Verify listeners were added
    expect(containerElement.addEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function));
    expect(containerElement.addEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(containerElement.addEventListener).toHaveBeenCalledWith('mouseup', expect.any(Function));
  });

  it('should trigger onOverlaySelected when overlay is double clicked or draw ends', () => {
    const { result } = renderHook(() => useDrawingTools({
      chartRef,
      containerRef,
      overlayColor: '#ffffff',
      overlayOpacity: 1,
      overlayFontSize: 12,
      onOverlayCreated,
      onOverlaySelected,
    }));

    act(() => {
      result.current.handleToolClick('segment');
    });

    const createOverlayArgs = mockChart.createOverlay.mock.calls[0][0];
    const mockEvent = { overlay: { id: 'overlay-123' } };

    // Simulate drawing end
    act(() => {
      createOverlayArgs.onDrawEnd(mockEvent);
    });
    expect(onOverlaySelected).toHaveBeenCalledWith(mockEvent.overlay);
    expect(onOverlayCreated).toHaveBeenCalledWith(mockEvent.overlay);

    // Simulate double click
    act(() => {
      createOverlayArgs.onDoubleClick(mockEvent);
    });
    expect(onOverlaySelected).toHaveBeenCalledWith(mockEvent.overlay);
  });

  it('selects anchored ranges when their overlay is clicked', () => {
    const { result } = renderHook(() => useDrawingTools({
      chartRef,
      containerRef,
      overlayColor: '#ffffff',
      overlayOpacity: 1,
      overlayFontSize: 12,
      onOverlayCreated,
      onOverlaySelected,
    }));

    act(() => {
      result.current.handleToolClick('anchoredVWAPRange');
    });

    const createOverlayArgs = mockChart.createOverlay.mock.calls[0][0];
    const overlay = { id: 'overlay-123', name: 'anchoredVWAPRange' };
    act(() => {
      createOverlayArgs.onSelected({ overlay });
    });

    expect(onOverlaySelected).toHaveBeenCalledWith(overlay);

    act(() => {
      createOverlayArgs.onPressedMoveEnd({ overlay: { ...overlay, extendData: { color: '#2196F3' } } });
    });
    expect(mockChart.overrideOverlay).toHaveBeenCalledWith({
      id: overlay.id,
      extendData: { color: '#2196F3', showHandles: true },
    });

    const drawnOverlay = {
      id: 'overlay-123',
      name: 'anchoredVWAPRange',
      points: [
        { dataIndex: 1, timestamp: 2000 },
        { dataIndex: 8, timestamp: 9000 },
      ],
    };
    mockChart.getDataList.mockReturnValue([
      { timestamp: 1000 },
      { timestamp: 2000 },
      { timestamp: 3000 },
    ]);
    mockChart.getOverlayById.mockImplementation(() => drawnOverlay);
    mockChart.overrideOverlay.mockImplementation(({ points }: { points?: typeof drawnOverlay.points }) => {
      if (points) drawnOverlay.points = points;
    });

    act(() => {
      createOverlayArgs.onDrawEnd({ overlay: drawnOverlay });
    });

    expect(onOverlayCreated).toHaveBeenCalledWith(expect.objectContaining({
      points: [
        expect.objectContaining({ dataIndex: 1, timestamp: 2000 }),
        expect.objectContaining({ dataIndex: 2, timestamp: 3000 }),
      ],
    }));
  });
});
