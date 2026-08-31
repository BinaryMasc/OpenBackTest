import { registerIndicator } from 'klinecharts';
import { ANCHORED_VOLUME_PROFILE_DEFAULT_PARAMS, ANCHORED_VOLUME_PROFILE_INDICATOR } from './indicators/anchoredVolumeProfile';
import { ANCHORED_VWAP_DEFAULT_PARAMS, ANCHORED_VWAP_INDICATOR } from './indicators/anchoredVWAP';
import { ATR_DEFAULT_PARAMS, ATR_INDICATOR } from './indicators/atr';
import { VPVR_DEFAULT_PARAMS, VPVR_INDICATOR } from './indicators/vpvr';

export const CUSTOM_INDICATORS_LIST = ['AVWAP', 'AVP', 'ATR', 'VPVR'] as const;
export const CUSTOM_INDICATOR_PARAMS: Record<string, number[]> = {
  AVWAP: [...ANCHORED_VWAP_DEFAULT_PARAMS],
  AVP: [...ANCHORED_VOLUME_PROFILE_DEFAULT_PARAMS],
  ATR: [...ATR_DEFAULT_PARAMS],
  VPVR: [...VPVR_DEFAULT_PARAMS],
};

export function registerCustomIndicators(): void {
  registerIndicator(VPVR_INDICATOR);
  registerIndicator(ANCHORED_VWAP_INDICATOR);
  registerIndicator(ANCHORED_VOLUME_PROFILE_INDICATOR);
  registerIndicator(ATR_INDICATOR);
}
