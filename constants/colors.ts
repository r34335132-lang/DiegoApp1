const COLORS = {
  background: "#09090B",
  surface: "#111113",
  card: "#18181B",
  cardHover: "#1F1F23",
  border: "#27272A",
  borderLight: "#3F3F46",

  primary: "#C9F93E",
  primaryDark: "#A8D82B",
  primaryText: "#09090B",

  accent: "#FF4444",
  accentBlue: "#3B82F6",
  accentOrange: "#F97316",

  text: "#FAFAFA",
  textSecondary: "#A1A1AA",
  textMuted: "#71717A",

  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",

  tabBar: "#09090B",
  tabBarBorder: "#27272A",
  tabActive: "#C9F93E",
  tabInactive: "#52525B",
};

export default {
  light: {
    text: COLORS.text,
    background: COLORS.background,
    tint: COLORS.primary,
    tabIconDefault: COLORS.tabInactive,
    tabIconSelected: COLORS.tabActive,
  },
  dark: {
    text: COLORS.text,
    background: COLORS.background,
    tint: COLORS.primary,
    tabIconDefault: COLORS.tabInactive,
    tabIconSelected: COLORS.tabActive,
  },
  ...COLORS,
};
