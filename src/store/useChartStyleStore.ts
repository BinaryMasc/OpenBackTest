import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_DAY_SEPARATOR_SETTINGS,
  type DaySeparatorSettings,
} from '../lib/chart/indicators/daySeparators';

interface CandleColors {
  upColor: string;
  downColor: string;
  upBorderColor: string;
  downBorderColor: string;
  upWickColor: string;
  downWickColor: string;
  backgroundColor: string;
}

interface ChartStyleState extends CandleColors {
  daySeparator: DaySeparatorSettings;
  isEditorOpen: boolean;

  setColors: (colors: Partial<CandleColors>) => void;
  setDaySeparator: (settings: Partial<DaySeparatorSettings>) => void;
  setEditorOpen: (open: boolean) => void;
  reset: () => void;
}

const DEFAULT_COLORS: CandleColors = {
  upColor: '#2DC08E',
  downColor: '#F92855',
  upBorderColor: '#2DC08E',
  downBorderColor: '#F92855',
  upWickColor: '#2DC08E',
  downWickColor: '#F92855',
  backgroundColor: '#0f172a',
};

export const useChartStyleStore = create<ChartStyleState>()(
  persist(
    (set) => ({
      ...DEFAULT_COLORS,
      daySeparator: DEFAULT_DAY_SEPARATOR_SETTINGS,
      isEditorOpen: false,

      setColors: (colors) => set(colors),
      setDaySeparator: (settings) => set(state => ({ daySeparator: { ...state.daySeparator, ...settings } })),
      setEditorOpen: (open) => set({ isEditorOpen: open }),
      reset: () => set({ ...DEFAULT_COLORS, daySeparator: DEFAULT_DAY_SEPARATOR_SETTINGS }),
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
