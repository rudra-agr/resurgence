import { themeQuartz } from 'ag-grid-community';

// One theme for every grid. Colours are the site's CSS variables, so they switch with the theme toggle.
export const agTheme = themeQuartz.withParams({
  fontFamily: 'var(--font-body)',
  foregroundColor: 'var(--ink)',
  backgroundColor: 'var(--surface)',
  headerBackgroundColor: 'var(--paper)',
  headerTextColor: 'var(--ink)',
  subtleTextColor: 'var(--ink-soft)',
  borderColor: 'var(--rule)',
  rowHoverColor: 'color-mix(in srgb, var(--ink) 6%, var(--surface))',
  selectedRowBackgroundColor: 'color-mix(in srgb, var(--accent) 16%, var(--surface))',
  accentColor: 'var(--accent)',
  wrapperBorderRadius: 0,
});
