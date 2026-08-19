import { registerOverlay } from 'klinecharts';
import type { OverlayFigure, OverlayCreateFiguresCallbackParams } from 'klinecharts';

const OVERLAY_LABEL_BACKGROUND = '#0f172a';
const OVERLAY_LABEL_TEXT = '#f8fafc';

function highContrastLabelStyles(accentColor: string, size: number, padding = 4) {
  return {
    style: 'stroke_fill',
    color: OVERLAY_LABEL_TEXT,
    size,
    weight: '600',
    backgroundColor: OVERLAY_LABEL_BACKGROUND,
    borderColor: accentColor,
    borderSize: 1,
    paddingLeft: padding + 1,
    paddingRight: padding + 1,
    paddingTop: padding,
    paddingBottom: padding,
    borderRadius: 4,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatTradePrice(value: number, precision: number): string {
  return value.toFixed(Math.max(0, precision));
}

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

  registerOverlay({
    name: 'positionLine',
    totalStep: 2,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay }: OverlayCreateFiguresCallbackParams): OverlayFigure[] => {
      if (coordinates.length === 0) return [];
      const y = coordinates[0].y;
      const data = overlay.extendData as Record<string, string> | undefined;
      const color = data?.color || '#2196F3';
      const text = data?.text || '';

      return [
        {
          type: 'line',
          attrs: {
            coordinates: [
              { x: 0, y },
              { x: bounding.width, y },
            ],
          },
          styles: { style: 'dashed', color, dashedValue: [4, 4], size: 2 },
        },
        {
          type: 'text',
          attrs: {
            x: 10,
            y: y - 10,
            text,
            align: 'left',
            baseline: 'bottom',
          },
          // A dark backing keeps the label legible on bright green/red position colors.
          styles: highContrastLabelStyles(color, 12, 5),
        },
      ];
    },
  });

  registerOverlay({
    name: 'brokerLine',
    totalStep: 2,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay }: OverlayCreateFiguresCallbackParams): OverlayFigure[] => {
      if (coordinates.length === 0) return [];
      const y = coordinates[0].y;
      const data = overlay.extendData as { text?: string; color?: string; dashed?: boolean } | undefined;
      const color = data?.color || '#60a5fa';
      const text = data?.text || '';

      return [
        {
          type: 'line',
          attrs: { coordinates: [{ x: 0, y }, { x: bounding.width, y }] },
          styles: {
            style: data?.dashed === false ? 'solid' : 'dashed',
            color,
            dashedValue: [5, 4],
            size: 2,
          },
        },
        {
          type: 'text',
          attrs: { x: 10, y: y - 10, text, align: 'left', baseline: 'bottom' },
          styles: highContrastLabelStyles(color, 11, 4),
        },
      ];
    },
  });

  registerOverlay({
    name: 'tpLine',
    totalStep: 2,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay }: OverlayCreateFiguresCallbackParams): OverlayFigure[] => {
      if (coordinates.length === 0) return [];
      const y = coordinates[0].y;
      const color = '#4caf50';
      const text = overlay.extendData as string || 'TP';
      return [
        {
          type: 'line',
          attrs: { coordinates: [{ x: 0, y }, { x: bounding.width, y }] },
          styles: { style: 'dashed', color, size: 1, dashedValue: [4, 4] },
        },
        {
          type: 'text',
          attrs: { x: 10, y: y - 10, text, align: 'left', baseline: 'bottom' },
          styles: highContrastLabelStyles(color, 13, 3),
        },
      ];
    },
  });

  registerOverlay({
    name: 'slLine',
    totalStep: 2,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay }: OverlayCreateFiguresCallbackParams): OverlayFigure[] => {
      if (coordinates.length === 0) return [];
      const y = coordinates[0].y;
      const color = '#f44336';
      const text = overlay.extendData as string || 'SL';
      return [
        {
          type: 'line',
          attrs: { coordinates: [{ x: 0, y }, { x: bounding.width, y }] },
          styles: { style: 'dashed', color, size: 1, dashedValue: [4, 4] },
        },
        {
          type: 'text',
          attrs: { x: 10, y: y - 10, text, align: 'left', baseline: 'bottom' },
          styles: highContrastLabelStyles(color, 11, 3),
        },
      ];
    },
  });

  registerOverlay({
    name: 'measurement',
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay, precision }: OverlayCreateFiguresCallbackParams): OverlayFigure[] => {
      if (coordinates.length < 2) return [];
      const p1 = coordinates[0];
      const p2 = coordinates[1];
      const points = overlay.points;

      const v1 = points[0].value ?? 0;
      const v2 = points[1].value ?? 0;
      const priceDiff = v2 - v1;
      const pricePercent = (priceDiff / v1) * 100;

      const i1 = points[0].dataIndex ?? 0;
      const i2 = points[1].dataIndex ?? 0;
      const bars = Math.abs(i2 - i1);

      const figures: OverlayFigure[] = [];

      // Box
      figures.push({
        type: 'polygon',
        attrs: {
          coordinates: [
            p1,
            { x: p2.x, y: p1.y },
            p2,
            { x: p1.x, y: p2.y },
          ],
        },
        styles: {
          style: 'stroke_fill',
          color: 'rgba(33, 150, 243, 0.15)',
          borderColor: '#2196F3',
          borderSize: 1
        },
      });

      // Line
      figures.push({
        type: 'line',
        attrs: { coordinates: [p1, p2] },
        styles: { color: '#2196F3', size: 1, style: 'dashed', dashedValue: [4, 4] }
      });

      // Label
      const sign = priceDiff >= 0 ? '+' : '';
      const labelX = (p1.x + p2.x) / 2;
      const labelY = (p1.y + p2.y) / 2;

      figures.push({
        type: 'text',
        attrs: {
          x: labelX,
          y: labelY - 8,
          text: `${sign}${priceDiff.toFixed(precision.price)} (${sign}${pricePercent.toFixed(2)}%)`,
          align: 'center',
          baseline: 'bottom',
        },
        styles: {
          color: '#ffffff',
          size: 12,
          backgroundColor: '#2196F3',
          paddingLeft: 6,
          paddingRight: 6,
          paddingTop: 2,
          paddingBottom: 2,
          borderRadius: 4
        },
      });

      figures.push({
        type: 'text',
        attrs: {
          x: labelX,
          y: labelY + 8,
          text: `${bars} bars`,
          align: 'center',
          baseline: 'top',
        },
        styles: {
          color: '#ffffff',
          size: 11,
          backgroundColor: 'rgba(33, 150, 243, 0.8)',
          paddingLeft: 6,
          paddingRight: 6,
          paddingTop: 2,
          paddingBottom: 2,
          borderRadius: 4
        },
      });

      return figures;
    },
  });

  registerOverlay({
    name: 'trade',
    // Click entry, target, then stop. The green/red zones deliberately use
    // fixed semantic colors instead of the generic drawing color.
    // KlineCharts completes an overlay at totalStep - 1 points.
    totalStep: 4,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    createPointFigures: ({ coordinates, overlay, precision }: OverlayCreateFiguresCallbackParams): OverlayFigure[] => {
      if (coordinates.length < 2) return [];

      const [entry, target, stop] = coordinates;
      const startX = Math.min(entry.x, target.x, stop?.x ?? target.x);
      const endX = Math.max(entry.x, target.x, stop?.x ?? target.x, startX + 8);
      const centerX = (startX + endX) / 2;

      const entryValue = overlay.points[0]?.value;
      const targetValue = overlay.points[1]?.value;
      const stopValue = overlay.points[2]?.value;
      const hasEntryAndTarget = isFiniteNumber(entryValue) && isFiniteNumber(targetValue);
      const hasStop = isFiniteNumber(stopValue);
      const pricePrecision = precision?.price ?? 2;
      const isLong = hasEntryAndTarget ? targetValue > entryValue : true;
      const direction = isLong ? 'LONG' : 'SHORT';
      const reward = hasEntryAndTarget ? Math.abs(targetValue - entryValue) : 0;
      const risk = hasEntryAndTarget && hasStop ? Math.abs(stopValue - entryValue) : 0;
      const targetPercent = hasEntryAndTarget && entryValue !== 0
        ? (reward / Math.abs(entryValue)) * 100
        : 0;
      const stopPercent = hasEntryAndTarget && hasStop && entryValue !== 0
        ? (risk / Math.abs(entryValue)) * 100
        : 0;
      const rewardText = hasEntryAndTarget
        ? `Target +${formatTradePrice(reward, pricePrecision)} (+${targetPercent.toFixed(2)}%)`
        : 'Target';
      const riskText = hasEntryAndTarget && hasStop
        ? `Stop -${formatTradePrice(risk, pricePrecision)} (-${stopPercent.toFixed(2)}%)`
        : 'Stop';
      const entryText = hasEntryAndTarget
        ? `${direction} · Entry ${formatTradePrice(entryValue, pricePrecision)}${risk > 0 ? ` · R:R ${(reward / risk).toFixed(2)}` : ''}`
        : 'Entry';

      const figures: OverlayFigure[] = [
        {
          type: 'polygon',
          attrs: {
            coordinates: [
              { x: startX, y: entry.y },
              { x: endX, y: entry.y },
              { x: endX, y: target.y },
              { x: startX, y: target.y },
            ],
          },
          styles: {
            style: 'stroke_fill',
            color: 'rgba(34, 197, 94, 0.24)',
            borderColor: '#22c55e',
            borderSize: 1,
          },
        },
        {
          type: 'line',
          attrs: { coordinates: [{ x: startX, y: entry.y }, { x: endX, y: entry.y }] },
          styles: { color: '#e2e8f0', size: 1, style: 'solid' },
        },
        {
          type: 'text',
          attrs: {
            x: startX + 6,
            y: entry.y - 6,
            text: entryText,
            align: 'left',
            baseline: 'bottom',
          },
          styles: highContrastLabelStyles(isLong ? '#22c55e' : '#ef4444', 11, 3),
        },
        {
          type: 'text',
          attrs: {
            x: centerX,
            y: (entry.y + target.y) / 2,
            text: rewardText,
            align: 'center',
            baseline: 'middle',
          },
          styles: highContrastLabelStyles('#22c55e', 11, 3),
        },
      ];

      if (stop) {
        figures.splice(1, 0, {
          type: 'polygon',
          attrs: {
            coordinates: [
              { x: startX, y: entry.y },
              { x: endX, y: entry.y },
              { x: endX, y: stop.y },
              { x: startX, y: stop.y },
            ],
          },
          styles: {
            style: 'stroke_fill',
            color: 'rgba(239, 68, 68, 0.24)',
            borderColor: '#ef4444',
            borderSize: 1,
          },
        });
        figures.push({
          type: 'text',
          attrs: {
            x: centerX,
            y: (entry.y + stop.y) / 2,
            text: riskText,
            align: 'center',
            baseline: 'middle',
          },
          styles: highContrastLabelStyles('#ef4444', 11, 3),
        });
      }

      return figures;
    },
  });

  registerOverlay({
    name: 'tradeArrow',
    totalStep: 1,
    createPointFigures: ({ coordinates, overlay }: OverlayCreateFiguresCallbackParams): OverlayFigure[] => {
      if (coordinates.length === 0) return [];
      const { x, y } = coordinates[0];
      const type = overlay.extendData as 'buy' | 'sell';
      const color = type === 'buy' ? '#22c55e' : '#ef4444';

      const figures: OverlayFigure[] = [];

      if (type === 'buy') {
        // Arrow pointing up
        figures.push({
          type: 'polygon',
          attrs: {
            coordinates: [
              { x, y },
              { x: x - 6, y: y + 12 },
              { x: x + 6, y: y + 12 }
            ]
          },
          styles: { style: 'fill', color }
        });
      } else {
        // Arrow pointing down
        figures.push({
          type: 'polygon',
          attrs: {
            coordinates: [
              { x, y },
              { x: x - 6, y: y - 12 },
              { x: x + 6, y: y - 12 }
            ]
          },
          styles: { style: 'fill', color }
        });
      }

      return figures;
    }
  });
}
