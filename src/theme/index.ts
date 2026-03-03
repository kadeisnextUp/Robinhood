// Main theme export - import from here in your components
export { colors } from './colors';
export { typography } from './typography';
export { spacing, borderRadius } from './spacing';

// You can also create a combined theme object if needed
import { colors } from './colors';
import { typography } from './typography';
import { spacing, borderRadius } from './spacing';

export const theme = {
  colors,
  typography,
  spacing,
  borderRadius,
};
