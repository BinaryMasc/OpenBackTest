export function hexToRgba(hex: string, alpha: number): string {
  let r = 0;
  let g = 0;
  let b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function isOscillatorIndicator(name: string): boolean {
  return ['VOL', 'RSI', 'MACD'].includes(name);
}

export function getPaneId(name: string): string {
  return isOscillatorIndicator(name) ? `pane_${name}` : 'candle_pane';
}
