export const colors = {
  background: '#0A0A0F',
  surface: '#141419',
  surfaceLight: '#1C1C24',
  surfaceHighlight: '#24242E',
  border: '#2A2A35',
  borderLight: '#363644',

  primary: '#6C5CE7',
  primaryLight: '#8B7CF7',
  primaryDark: '#5A4BD6',
  primaryMuted: 'rgba(108, 92, 231, 0.15)',

  secondary: '#00D2FF',
  secondaryMuted: 'rgba(0, 210, 255, 0.15)',

  success: '#00E676',
  successMuted: 'rgba(0, 230, 118, 0.15)',

  warning: '#FFB74D',
  warningMuted: 'rgba(255, 183, 77, 0.15)',

  danger: '#FF5252',
  dangerMuted: 'rgba(255, 82, 82, 0.15)',

  text: '#FFFFFF',
  textSecondary: '#9898A6',
  textMuted: '#5A5A6E',
  textInverse: '#0A0A0F',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 28,
  hero: 48,
} as const;

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const theme = {
  colors,
  spacing,
  radius,
  fontSize,
  fontWeight,
} as const;

export type Theme = typeof theme;
