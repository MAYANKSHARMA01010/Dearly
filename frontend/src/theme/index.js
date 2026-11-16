import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
import { DarkTheme, DefaultTheme } from 'expo-router/react-navigation';

// Keep Paper's established Material 3 colors and platform font defaults.
export const lightTheme = { ...MD3LightTheme, roundness: 12 };
export const darkTheme = { ...MD3DarkTheme, roundness: 12 };
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };
export const layout = { contentWidth: 600, minimumTouchTarget: 48 };

/** @param {boolean} dark */
export function getAppThemes(dark) {
  const paper = dark ? darkTheme : lightTheme;
  const base = dark ? DarkTheme : DefaultTheme;
  return {
    paper,
    navigation: { ...base, colors: {
      ...base.colors,
      primary: paper.colors.primary,
      background: paper.colors.background,
      card: paper.colors.surface,
      text: paper.colors.onSurface,
      border: paper.colors.outlineVariant,
      notification: paper.colors.error,
    } },
  };
}
