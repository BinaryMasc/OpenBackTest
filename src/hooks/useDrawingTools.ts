import { useState, useEffect, useRef, useCallback } from 'react';
import type { Chart, Overlay, Point, OverlayCreate } from 'klinecharts';
import { CANDLE_PANE_ID, DRAWING_GROUP_ID, INDICATOR_RANGE_GROUP_ID } from '../lib/chart/constants';
import { hexToRgba } from '../lib/chart/utils';
import {
  clampAnchoredRangeToData,
  commitAnchoredRangeMove,
  getAnchoredIndicatorForRangeOverlay,
  getAnchoredRangeLabel,
  patchOverlayExtendData,
} from '../lib/chart/overlays';

interface UseDrawingToolsOptions {
  chartRef: React.RefObject<Chart | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  overlayColor: string;
  overlayOpacity: number;
  overlayFontSize: number;
  onOverlayCreated: (overlay: Overlay) => void;
  onOverlayChanged?: (overlay: Overlay) => void;
  onOverlaySelected: (overlay: Overlay | null) => void;
}

export function useDrawingTools({
  chartRef,
  containerRef,
  overlayColor,
  overlayOpacity,
  overlayFontSize,
  onOverlayCreated,
  onOverlayChanged,
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
    const overlayId = `overlay_${Date.now()}`;
    const anchoredIndicator = getAnchoredIndicatorForRangeOverlay(toolName);
    const isAnchoredRange = anchoredIndicator !== null;
    const config: OverlayCreate = {
      name: toolName,
      id: overlayId,
      groupId: isAnchoredRange ? INDICATOR_RANGE_GROUP_ID : DRAWING_GROUP_ID,
      extendData: toolName === 'text' ? 'Text' : undefined,
      styles: {
        line: { color: rgba },
        polygon: { color: rgba, borderSize: 1, borderColor: rgba },
        circle: { color: rgba },
        text: toolName === 'text' ? { color: overlayColor, size: overlayFontSize } : undefined,
      },
      onDrawEnd: (event: { overlay: Overlay }) => {
        const overlay = isAnchoredRange
          ? clampAnchoredRangeToData(chart, event.overlay)
          : event.overlay;
        onOverlaySelected(overlay);
        selectedForDeleteRef.current = overlay.id;
        onOverlayCreated(overlay);
        setActiveTool(null);
        return true;
      },
      onSelected: (event: { overlay: Overlay }) => {
        selectedForDeleteRef.current = event.overlay.id;
        if (isAnchoredRange) onOverlaySelected(event.overlay);
        if (event.overlay.name === 'trade') patchOverlayExtendData(chart, event.overlay, { selected: true });
        return true;
      },
      onDeselected: (event: { overlay: Overlay }) => {
        if (selectedForDeleteRef.current === event.overlay.id) {
          selectedForDeleteRef.current = null;
        }
        if (event.overlay.name === 'trade') patchOverlayExtendData(chart, event.overlay, { selected: false });
        return true;
      },
      onDoubleClick: (event: { overlay: Overlay }) => {
        onOverlaySelected(event.overlay);
        return true;
      },
      onPressedMoveEnd: (event: { overlay: Overlay }) => {
        if (isAnchoredRange) {
          commitAnchoredRangeMove(chart, event.overlay, overlay => onOverlayChanged?.(overlay));
        }
        return true;
      },
    };

    if (toolName === 'trade') {
      config.extendData = { rewardColor: '#22c55e', riskColor: '#ef4444' };
    }
    if (anchoredIndicator) {
      config.extendData = { label: getAnchoredRangeLabel(anchoredIndicator), color: overlayColor };
    }

    chart.createOverlay(config);
  }, [activeTool, chartRef, overlayColor, overlayOpacity, overlayFontSize, onOverlaySelected, onOverlayCreated, onOverlayChanged]);

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
        { paneId: CANDLE_PANE_ID }
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
        CANDLE_PANE_ID
      ) as string;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDrawing || !pencilOverlayId || !chart) return;
      const rect = container.getBoundingClientRect();
      const converted = chart.convertFromPixel(
        [{ x: e.clientX - rect.left, y: e.clientY - rect.top }],
        { paneId: CANDLE_PANE_ID }
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
