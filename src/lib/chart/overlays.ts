import { registerOverlay } from 'klinecharts';
import type { OverlayFigure, OverlayCreateFiguresCallbackParams } from 'klinecharts';
import { hexToRgba } from './utils';

const OVERLAY_LABEL_BACKGROUND = '#0f172a';
const OVERLAY_LABEL_TEXT = '#f8fafc';

export const ANCHORED_VWAP_RANGE_OVERLAY = 'anchoredVWAPRange';
export const ANCHORED_VOLUME_PROFILE_RANGE_OVERLAY = 'anchoredVolumeProfileRange';

export function getAnchoredIndicatorForRangeOverlay(name: string): 'AVWAP' | 'AVP' | null {
  if (name === ANCHORED_VWAP_RANGE_OVERLAY) return 'AVWAP';
  if (name === ANCHORED_VOLUME_PROFILE_RANGE_OVERLAY) return 'AVP';
  return null;
}

export function getRangeOverlayForAnchoredIndicator(name: string): string | null {
  if (name === 'AVWAP') return ANCHORED_VWAP_RANGE_OVERLAY;
  if (name === 'AVP') return ANCHORED_VOLUME_PROFILE_RANGE_OVERLAY;
  return null;
}

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
  const registerRangeOverlay = (name: string, label: string, color: string) => {
    registerOverlay({
      name,
      totalStep: 3,
      needDefaultPointFigure: true,
      needDefaultXAxisFigure: true,
      needDefaultYAxisFigure: false,
      createPointFigures: ({ coordinates, bounding, overlay }: OverlayCreateFiguresCallbackParams): OverlayFigure[] => {
        if (coordinates.length < 2) return [];
        const left = Math.min(coordinates[0].x, coordinates[1].x);
        const right = Math.max(coordinates[0].x, coordinates[1].x);
        const top = bounding.top ?? 0;
        const bottom = bounding.bottom ?? bounding.height ?? top;
        const data = overlay.extendData as { color?: string; label?: string } | undefined;
        const accent = data?.color ?? color;
        const rangeLabel = data?.label ?? label;
        return [
          {
            type: 'polygon',
            attrs: { coordinates: [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }] },
            styles: { style: 'stroke_fill', color: hexToRgba(accent, 0.12), borderColor: accent, borderSize: 1 },
          },
          {
            type: 'line',
            attrs: { coordinates: [{ x: left, y: top }, { x: left, y: bottom }] },
            styles: { color: accent, style: 'dashed', dashedValue: [4, 4], size: 1 },
          },
          {
            type: 'line',
            attrs: { coordinates: [{ x: right, y: top }, { x: right, y: bottom }] },
            styles: { color: accent, style: 'dashed', dashedValue: [4, 4], size: 1 },
          },
          {
            type: 'text',
            attrs: { x: left + 5, y: top + 5, text: rangeLabel, align: 'left', baseline: 'top' },
            styles: highContrastLabelStyles(accent, 11, 3),
          },
        ];
      },
    });
  };

  registerRangeOverlay(ANCHORED_VWAP_RANGE_OVERLAY, 'Anchored VWAP range', '#2196F3');
  registerRangeOverlay(ANCHORED_VOLUME_PROFILE_RANGE_OVERLAY, 'Anchored Volume Profile range', '#FF9800');

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
    // Click entry, target, then stop. Colors are stored on the overlay so the
    // drawing can be customized; labels are shown only while selected.
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
      const data = overlay.extendData as { rewardColor?: string; riskColor?: string; selected?: boolean } | undefined;
      const rewardColor = data?.rewardColor ?? '#22c55e';
      const riskColor = data?.riskColor ?? '#ef4444';
      const entryValue = overlay.points[0]?.value;
      const targetValue = overlay.points[1]?.value;
      const stopValue = overlay.points[2]?.value;
      const hasEntryAndTarget = isFiniteNumber(entryValue) && isFiniteNumber(targetValue);
      const hasStop = isFiniteNumber(stopValue);

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
            style: 'fill',
            color: hexToRgba(rewardColor, 0.24),
            borderSize: 0,
          },
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
            style: 'fill',
            color: hexToRgba(riskColor, 0.24),
            borderSize: 0,
          },
        });
      }

      if (data?.selected) {
        const pricePrecision = precision?.price ?? 2;
        const reward = hasEntryAndTarget ? Math.abs(targetValue - entryValue) : 0;
        const risk = hasEntryAndTarget && hasStop ? Math.abs(stopValue - entryValue) : 0;
        const direction = hasEntryAndTarget && targetValue > entryValue ? 'LONG' : 'SHORT';
        const entryText = hasEntryAndTarget
          ? `${direction} · Entry ${formatTradePrice(entryValue, pricePrecision)}${risk > 0 ? ` · R:R ${(reward / risk).toFixed(2)}` : ''}`
          : 'Entry';
        figures.push({
          type: 'text',
          attrs: { x: startX + 6, y: entry.y - 6, text: entryText, align: 'left', baseline: 'bottom' },
          styles: { color: '#ffffff', size: 11 },
        });
        figures.push({
          type: 'text',
          attrs: { x: (startX + endX) / 2, y: (entry.y + target.y) / 2, text: `Target +${formatTradePrice(reward, pricePrecision)}`, align: 'center', baseline: 'middle' },
          styles: { color: '#ffffff', size: 11 },
        });
        if (stop) {
          figures.push({
            type: 'text',
            attrs: { x: (startX + endX) / 2, y: (entry.y + stop.y) / 2, text: `Stop -${formatTradePrice(risk, pricePrecision)}`, align: 'center', baseline: 'middle' },
            styles: { color: '#ffffff', size: 11 },
          });
        }
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
      const data = overlay.extendData as { type?: 'buy' | 'sell'; color?: string } | 'buy' | 'sell';
      const type = typeof data === 'string' ? data : data?.type;
      const color = typeof data === 'string' ? '#ffffff' : data?.color ?? '#ffffff';

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
