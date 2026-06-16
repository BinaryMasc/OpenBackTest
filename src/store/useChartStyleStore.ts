import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ChartStyleState {
  upColor: string;
  downColor: string;
  upBorderColor: string;
  downBorderColor: string;
  upWickColor: string;
  downWickColor: string;
  isEditorOpen: boolean;

  setColors: (colors: Partial<Omit<ChartStyleState, 'isEditorOpen' | 'setColors' | 'setEditorOpen' | 'reset'>>) => void;
  setEditorOpen: (open: boolean) => void;
  reset: () => void;
}

const DEFAULT_STYLE = {
  upColor: '#2DC08E',
  downColor: '#F92855',
  upBorderColor: '#2DC08E',
  downBorderColor: '#F92855',
  upWickColor: '#2DC08E',
  downWickColor: '#F92855',
};

export const useChartStyleStore = create<ChartStyleState>()(
  persist(
    (set) => ({
      ...DEFAULT_STYLE,
      isEditorOpen: false,

      setColors: (colors) => set((state) => ({ ...state, ...colors })),
      setEditorOpen: (open) => set({ isEditorOpen: open }),
      reset: () => set((state) => ({ ...state, ...DEFAULT_STYLE })),
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
      }),
    }
  )
);
