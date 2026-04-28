// main theme export - import from here in your components
export { colors } from './colors';
export { borderRadius, spacing } from './spacing';
export { typography } from './typography';

import { colors } from './colors';
import { borderRadius, spacing } from './spacing';
import { typography } from './typography';

export const theme = {
  colors,
  typography,
  spacing,
  borderRadius,
};
