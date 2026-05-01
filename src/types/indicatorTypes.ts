/** Represents a single indicator instance on the chart */
export interface IndicatorInstance {
  /** Unique identifier, e.g. "ema_1714600000000" */
  id: string;
  /** klinecharts indicator name: 'EMA', 'SMA', etc. */
  name: string;
  /** Calculation parameters, e.g. [14] or [12, 26, 9] */
  calcParams: number[];
  /** HEX color for the indicator lines */
  color: string;
  /** Opacity from 0.1 to 1.0 */
  opacity: number;
  /** Whether this indicator is currently visible */
  visible: boolean;
  /** Chart pane where the indicator is rendered */
  paneId: string;
}
