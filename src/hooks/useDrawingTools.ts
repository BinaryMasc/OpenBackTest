import { useState, useEffect, useRef, useCallback } from 'react';
import type { Chart, Overlay, Point, OverlayCreate } from 'klinecharts';
import { DRAWING_GROUP_ID } from '../lib/chart/constants';
import { hexToRgba } from '../lib/chart/utils';

interface UseDrawingToolsOptions {
  chartRef: React.RefObject<Chart | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  overlayColor: string;
  overlayOpacity: number;
  onOverlayCreated: (overlay: Overlay) => void;
  onOverlaySelected: (overlay: Overlay | null) => void;
}

export function useDrawingTools({
  chartRef,
  containerRef,
  overlayColor,
  overlayOpacity,
  onOverlayCreated,
  onOverlaySelected,
}: UseDrawingToolsOptions) {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const selectedForDeleteRef = useRef<string | null>(null);

  const handleToolClick = useCallback((toolName: string) => {
    const chart = chartRef.current;
    if (!chart) return;

    if (activeTool === toolName) {
      setActiveTool(null);
      return;
    }

    setActiveTool(toolName);
    if (toolName === 'pencil') return;

    const rgba = hexToRgba(overlayColor, overlayOpacity);
    const config: OverlayCreate = {
      name: toolName,
      id: `overlay_${Date.now()}`,
      groupId: DRAWING_GROUP_ID,
      styles: {
        line: { color: rgba },
        polygon: { color: rgba, borderSize: 1, borderColor: rgba },
        circle: { color: rgba },
      },
      onDrawEnd: (event: { overlay: Overlay }) => {
        onOverlaySelected(event.overlay);
        selectedForDeleteRef.current = event.overlay.id;
        onOverlayCreated(event.overlay);
        setActiveTool(null);
        return true;
      },
      onSelected: (event: { overlay: Overlay }) => {
        selectedForDeleteRef.current = event.overlay.id;
        return true;
      },
      onDeselected: (event: { overlay: Overlay }) => {
        if (selectedForDeleteRef.current === event.overlay.id) {
          selectedForDeleteRef.current = null;
        }
        return true;
      },
      onDoubleClick: (event: { overlay: Overlay }) => {
        onOverlaySelected(event.overlay);
        return true;
      },
    };

    chart.createOverlay(config);
  }, [activeTool, chartRef, overlayColor, overlayOpacity, onOverlaySelected, onOverlayCreated]);

  useEffect(() => {
    const container = containerRef.current;
    const chart = chartRef.current;
    if (!container || !chart) return;
    if (activeTool !== 'pencil') return;

    let isDrawing = false;
    let pencilOverlayId: string | null = null;
    let currentPoints: Partial<Point>[] = [];

    const handleMouseDown = (e: MouseEvent) => {
      chart.setScrollEnabled(false);
      isDrawing = true;
      const rect = container.getBoundingClientRect();
      const converted = chart.convertFromPixel(
        [{ x: e.clientX - rect.left, y: e.clientY - rect.top }],
        { paneId: 'candle_pane' }
      );
      const point = Array.isArray(converted) ? converted[0] : converted;
      if (!point) return;
      currentPoints = [point];
      const rgba = hexToRgba(overlayColor, overlayOpacity);
      pencilOverlayId = chart.createOverlay(
        {
          name: 'pencil',
          groupId: DRAWING_GROUP_ID,
          points: currentPoints,
          styles: { line: { color: rgba, size: 2 } },
          onSelected: (event: { overlay: Overlay }) => {
            selectedForDeleteRef.current = event.overlay.id;
            return true;
          },
          onDeselected: (event: { overlay: Overlay }) => {
            if (selectedForDeleteRef.current === event.overlay.id) {
              selectedForDeleteRef.current = null;
            }
            return true;
          },
          onDoubleClick: (event: { overlay: Overlay }) => {
            onOverlaySelected(event.overlay);
            return true;
          },
        },
        'candle_pane'
      ) as string;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDrawing || !pencilOverlayId || !chart) return;
      const rect = container.getBoundingClientRect();
      const converted = chart.convertFromPixel(
        [{ x: e.clientX - rect.left, y: e.clientY - rect.top }],
        { paneId: 'candle_pane' }
      );
      const point = Array.isArray(converted) ? converted[0] : converted;
      if (!point) return;
      currentPoints.push(point);
      chart.overrideOverlay({ id: pencilOverlayId, points: currentPoints });
    };

    const handleMouseUp = () => {
      if (!isDrawing || !chart || !pencilOverlayId) return;
      const overlay = chart.getOverlayById(pencilOverlayId);
      if (overlay) {
        onOverlaySelected(overlay);
        selectedForDeleteRef.current = overlay.id;
        onOverlayCreated(overlay);
      }
      isDrawing = false;
      pencilOverlayId = null;
      currentPoints = [];
      chart.setScrollEnabled(true);
      setActiveTool(null);
    };

    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('mouseleave', handleMouseUp);
    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('mouseleave', handleMouseUp);
    };
  }, [activeTool, overlayColor, overlayOpacity, chartRef, containerRef, onOverlayCreated, onOverlaySelected]);

  return { activeTool, handleToolClick, selectedForDeleteRef, setActiveTool };
}
