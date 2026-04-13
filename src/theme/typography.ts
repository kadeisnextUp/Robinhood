// Typography system for the app
export const typography = {
  // Font sizes
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
  
  // Font weights
  weights: {
    light: '300',
    regular: '400',
    medium: '500',
    semiBold: '600',
    bold: '700',
  } as const,
  
  // Line heights (relative to font size)
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
};
