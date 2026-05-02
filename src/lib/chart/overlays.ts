import { registerOverlay } from 'klinecharts';
import type { OverlayFigure, OverlayCreateFiguresCallbackParams } from 'klinecharts';

export function registerCustomOverlays(): void {
  registerOverlay({
    name: 'rect',
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    totalStep: 3,
    createPointFigures: ({ coordinates }: OverlayCreateFiguresCallbackParams): OverlayFigure[] => {
      if (coordinates.length < 2) return [];
      return [
        {
          type: 'polygon',
          attrs: {
            coordinates: [
              coordinates[0],
              { x: coordinates[1].x, y: coordinates[0].y },
              coordinates[1],
              { x: coordinates[0].x, y: coordinates[1].y },
            ],
          },
          styles: { style: 'stroke_fill' },
        },
      ];
    },
  });

  registerOverlay({
    name: 'pencil',
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    totalStep: 1,
    createPointFigures: ({ coordinates }: OverlayCreateFiguresCallbackParams): OverlayFigure[] => {
      if (coordinates.length < 2) return [];
      return [
        {
          type: 'line',
          attrs: { coordinates },
          styles: { style: 'solid' },
        },
      ];
    },
  });

  registerOverlay({
    name: 'fibonacciLine',
    totalStep: 3,
    needDefaultPointFigure: true,
    createPointFigures: ({ coordinates, overlay }: OverlayCreateFiguresCallbackParams): OverlayFigure[] => {
      if (coordinates.length < 2) return [];
      const p1 = coordinates[0];
      const p2 = coordinates[1];
      const figures: OverlayFigure[] = [];

      const lineStyles = overlay.styles as Record<string, unknown>;
      const lineObj = lineStyles?.line as Record<string, string> | undefined;
      const color = lineObj?.color ?? 'rgba(33, 150, 243, 0.7)';

      figures.push({
        type: 'line',
        attrs: { coordinates: [p1, p2] },
        styles: { style: 'dashed', color: color.replace(/[\d.]+\)$/g, '0.3)') },
      });

      const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
      const minX = Math.min(p1.x, p2.x);
      const maxX = Math.max(p1.x, p2.x);

      for (const level of levels) {
        const y = p1.y + (p2.y - p1.y) * level;
        figures.push({
          type: 'line',
          attrs: {
            coordinates: [
              { x: minX, y },
              { x: maxX, y },
            ],
          },
          styles: { color },
        });

        figures.push({
          type: 'text',
          attrs: {
            x: minX + 5,
            y: y - 2,
            text: `${(level * 100).toFixed(1)}%`,
            align: 'left',
            baseline: 'bottom',
          },
          styles: { color: '#ffffff', size: 11 },
        });
      }

       return figures;
    },
  });

  registerOverlay({
    name: 'circle',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay }: OverlayCreateFiguresCallbackParams): OverlayFigure[] => {
      if (coordinates.length < 2) return [];
      const cx = coordinates[0].x;
      const cy = coordinates[0].y;
      const dx = coordinates[1].x - cx;
      const dy = coordinates[1].y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      const overlayStyles = overlay.styles as Record<string, unknown> | undefined;
      const circleObj = overlayStyles?.circle as Record<string, string> | undefined;
      const color = circleObj?.color ?? 'rgba(33, 150, 243, 0.5)';
      return [
        {
          type: 'circle',
          attrs: { x: cx, y: cy, r },
          styles: { color, style: 'stroke_fill' },
        },
      ];
    },
  });

  registerOverlay({
    name: 'text',
    totalStep: 1,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    createPointFigures: ({ coordinates, overlay }: OverlayCreateFiguresCallbackParams): OverlayFigure[] => {
      if (coordinates.length < 1) return [];
      const content = (overlay.extendData as string) ?? 'Text';
      const overlayStyles = overlay.styles as Record<string, unknown> | undefined;
      const textStyle = overlayStyles?.text as Record<string, string> | undefined;
      const color = textStyle?.color ?? '#ffffff';
      const size = textStyle?.size ?? 12;
      return [
        {
          type: 'text',
          attrs: {
            x: coordinates[0].x,
            y: coordinates[0].y,
            text: content,
            align: 'left',
            baseline: 'top',
          },
          styles: { color, size, backgroundColor: 'transparent' },
        },
      ];
    },
  });
}
