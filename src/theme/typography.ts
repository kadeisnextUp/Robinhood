// Typography system for the app
export const typography = {
  // fedoka font families by weight — use these instead of fontWeight with custom fonts
  fonts: {
    light:    'Fredoka_300Light',
    regular:  'Fredoka_400Regular',
    medium:   'Fredoka_500Medium',
    semiBold: 'Fredoka_600SemiBold',
    bold:     'Fredoka_700Bold',
  },

  // font sizes
  sizes: {
    xs: 10,
    sm: 12,
    body: 16,
    md: 18,
    lg: 20,
    xl: 24,
    xxl: 28,
    xxxl: 32,

  },
  
  // font weights
  weights: {
    light: '300',
    regular: '400',
    medium: '500',
    semiBold: '600',
    bold: '700',
  } as const,
  
  // line heights (relative to font size)
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
};
