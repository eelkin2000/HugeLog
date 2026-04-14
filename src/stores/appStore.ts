import { create } from 'zustand';
import type { WeightUnit } from '@/utils/constants';

export interface ChartSettings {
  yTickCount: number;   // 3-10
  xTickCount: number;   // 3-10
  showGrid: boolean;
  showXLabels: boolean;
  showYLabels: boolean;
}

interface AppState {
  unit: WeightUnit;
  defaultRestSeconds: number;
  hasCompletedOnboarding: boolean;
  chartSettings: ChartSettings;
  setUnit: (unit: WeightUnit) => void;
  setDefaultRestSeconds: (seconds: number) => void;
  setHasCompletedOnboarding: (value: boolean) => void;
  setChartSettings: (settings: Partial<ChartSettings>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  unit: 'lb',
  defaultRestSeconds: 90,
  hasCompletedOnboarding: false,
  chartSettings: {
    yTickCount: 5,
    xTickCount: 5,
    showGrid: true,
    showXLabels: true,
    showYLabels: true,
  },
  setUnit: (unit) => set({ unit }),
  setDefaultRestSeconds: (defaultRestSeconds) => set({ defaultRestSeconds }),
  setHasCompletedOnboarding: (hasCompletedOnboarding) => set({ hasCompletedOnboarding }),
  setChartSettings: (settings) =>
    set((s) => ({ chartSettings: { ...s.chartSettings, ...settings } })),
}));
