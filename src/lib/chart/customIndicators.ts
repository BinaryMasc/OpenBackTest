import { registerIndicator } from 'klinecharts';
import type { CustomIndicatorDefinition } from './indicatorDefinition';
import { ANCHORED_VOLUME_PROFILE_INDICATOR } from './indicators/anchoredVolumeProfile';
import { ANCHORED_VWAP_INDICATOR } from './indicators/anchoredVWAP';
import { ATR_INDICATOR } from './indicators/atr';
import { VPVR_INDICATOR } from './indicators/vpvr';
import { DAY_SEPARATOR_INDICATOR } from './indicators/daySeparators';
import { fairValueGap } from './indicators/fairValueGap';
import { marketStructure } from './indicators/marketStructure';

import { htfCandle } from './indicators/htfCandle';
import { liquiditySweeps } from './indicators/liquiditySweeps';

import { bitcoinGex, stopLiquidity } from './indicators/liveLevels';

const profileParameters = [{ label: 'Rows' }, { label: 'Width %' }, { label: 'Value area %' }];
const rangeHelp = 'The highlighted range on the chart is the anchor. Drag its endpoints to change the selected range.';

const definitions: CustomIndicatorDefinition[] = [
  {
    template: ANCHORED_VWAP_INDICATOR, label: 'Anchored Volume Weighted Average Price', perInstance: true,
    parameterPrefix: values => values.map(() => null),
    parameterHelp: rangeHelp,
  },
  {
    template: ANCHORED_VOLUME_PROFILE_INDICATOR, label: 'Anchored Volume Profile', perInstance: true,
    parameters: profileParameters,
    // Current charts store two range timestamps. Older charts have one editable lookback.
    parameterPrefix: values => values.length >= 5 ? [null, null] : [{ label: 'Lookback (bars)' }],
    parameterHelp: rangeHelp,
  },
  { template: ATR_INDICATOR, label: 'Average True Range', parameters: [{ label: 'Period' }] },
  { template: VPVR_INDICATOR, label: 'Visible Range Volume Profile', parameters: profileParameters },
  fairValueGap,
  marketStructure,
  liquiditySweeps,
  htfCandle,
  bitcoinGex,
  stopLiquidity,
];

const byName = new Map(definitions.map(definition => [definition.template.name, definition]));
export const CUSTOM_INDICATORS_LIST = [...byName.keys()];
export const CUSTOM_INDICATOR_PARAMS: Record<string, number[]> = Object.fromEntries(
  definitions.map(({ template }) => [template.name, template.calcParams ?? []]),
);

export function getCustomIndicator(name: string) {
  return byName.get(name);
}

// KlineCharts keys indicators by name within a pane. Give independently
// editable overlays a stable engine name for each saved instance.
const registeredNames = new Set<string>();

export function getIndicatorEngineName({ name, id }: { name: string; id: string }): string {
  const definition = getCustomIndicator(name);
  if (!definition?.perInstance) return name;
  const engineName = `${name}_${id}`;
  if (!registeredNames.has(engineName)) {
    registerIndicator({ ...definition.template, name: engineName, shortName: name });
    registeredNames.add(engineName);
  }
  return engineName;
}

export function registerCustomIndicators(): void {
  definitions.forEach(({ template }) => registerIndicator(template));
  registerIndicator(DAY_SEPARATOR_INDICATOR);
}
