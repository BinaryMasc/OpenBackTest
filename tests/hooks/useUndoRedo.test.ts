import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUndoRedo } from '../../src/hooks/useUndoRedo';
import type { Chart, Overlay } from 'klinecharts';

describe('useUndoRedo', () => {
  it('should initialize with empty stacks and flags set to false', () => {
    const { result } = renderHook(() => useUndoRedo());
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it('should record an ADD action and allow undo/redo', () => {
    const { result } = renderHook(() => useUndoRedo());
    const mockOverlay = { id: 'test-1', name: 'line', groupId: 'drawing', points: [], styles: {} } as unknown as Overlay;
    
    act(() => {
      result.current.recordAdd(mockOverlay);
    });

    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    // Mock chart
    const mockChart = {
      removeOverlay: vi.fn(),
      createOverlay: vi.fn(),
      getOverlayById: vi.fn().mockReturnValue(mockOverlay),
    } as unknown as Chart;

    const mockDeselect = vi.fn();

    act(() => {
      result.current.undo(mockChart, mockDeselect);
    });

    expect(mockChart.removeOverlay).toHaveBeenCalledWith({ id: 'test-1' });
    expect(mockDeselect).toHaveBeenCalledWith('test-1');
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);

    const mockSelect = vi.fn();

    act(() => {
      result.current.redo(mockChart, mockSelect);
    });

    expect(mockChart.createOverlay).toHaveBeenCalled();
    expect(mockSelect).toHaveBeenCalledWith(mockOverlay);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it('should record a REMOVE action and allow undo/redo', () => {
    const { result } = renderHook(() => useUndoRedo());
    const mockOverlay = { id: 'test-2', name: 'circle', groupId: 'drawing', points: [], styles: {} } as unknown as Overlay;
    
    act(() => {
      result.current.recordRemove(mockOverlay);
    });

    expect(result.current.canUndo).toBe(true);

    const mockChart = {
      createOverlay: vi.fn(),
      removeOverlay: vi.fn(),
    } as unknown as Chart;

    act(() => {
      result.current.undo(mockChart);
    });

    // Undo a REMOVE means it should CREATE
    expect(mockChart.createOverlay).toHaveBeenCalled();

    act(() => {
      result.current.redo(mockChart);
    });

    // Redo a REMOVE means it should REMOVE
    expect(mockChart.removeOverlay).toHaveBeenCalledWith({ id: 'test-2' });
  });
});
