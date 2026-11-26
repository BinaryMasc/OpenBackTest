import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_DAY_SEPARATOR_SETTINGS,
  type DaySeparatorSettings,
} from '../lib/chart/indicators/daySeparators';

import { DEFAULT_CANDLE_COLORS } from '../lib/chart/candleColors';

type CandleColors = typeof DEFAULT_CANDLE_COLORS;

interface ChartStyleState extends CandleColors {
  daySeparator: DaySeparatorSettings;
  isEditorOpen: boolean;

  setColors: (colors: Partial<CandleColors>) => void;
  setDaySeparator: (settings: Partial<DaySeparatorSettings>) => void;
  setEditorOpen: (open: boolean) => void;
  reset: () => void;
}

export const useChartStyleStore = create<ChartStyleState>()(
  persist(
    (set) => ({
      ...DEFAULT_CANDLE_COLORS,
      daySeparator: DEFAULT_DAY_SEPARATOR_SETTINGS,
      isEditorOpen: false,

      setColors: (colors) => set(colors),
      setDaySeparator: (settings) => set(state => ({ daySeparator: { ...state.daySeparator, ...settings } })),
      setEditorOpen: (open) => set({ isEditorOpen: open }),
      reset: () => set({ ...DEFAULT_CANDLE_COLORS, daySeparator: DEFAULT_DAY_SEPARATOR_SETTINGS }),
    }),
    {
      name: 'chart-style-storage',
      partialize: (state) => ({
        upColor: state.upColor,
        downColor: state.downColor,
        upBorderColor: state.upBorderColor,
        downBorderColor: state.downBorderColor,
        upWickColor: state.upWickColor,
        downWickColor: state.downWickColor,
        backgroundColor: state.backgroundColor,
        daySeparator: state.daySeparator,
      }),
      // Settings saved before a field existed keep that field's default.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<ChartStyleState>;
        return {
          ...current,
          ...saved,
          daySeparator: { ...DEFAULT_DAY_SEPARATOR_SETTINGS, ...saved.daySeparator },
        };
      },
    }
  )
);
