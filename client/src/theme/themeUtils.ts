import colors from './colors.json';

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  // Remove the # if present
  hex = hex.replace('#', '');

  // Convert hex to RGB
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }

    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

export function generateThemeVariables(): Record<string, string> {
  const cssVariables: Record<string, string> = {};

  // Convert toolbar colors
  const toolbarBgHsl = hexToHsl(colors.toolbar.background);
  const toolbarTextHsl = hexToHsl(colors.toolbar.text);
  cssVariables['--toolbar-bg'] = `${toolbarBgHsl.h} ${toolbarBgHsl.s}% ${toolbarBgHsl.l}%`;
  cssVariables['--toolbar-text'] = `${toolbarTextHsl.h} ${toolbarTextHsl.s}% ${toolbarTextHsl.l}%`;

  // Convert sidebar colors
  const sidebarBgHsl = hexToHsl(colors.sidebar.background);
  const sidebarTextHsl = hexToHsl(colors.sidebar.text);
  cssVariables['--sidebar-bg'] = `${sidebarBgHsl.h} ${sidebarBgHsl.s}% ${sidebarBgHsl.l}%`;
  cssVariables['--sidebar-text'] = `${sidebarTextHsl.h} ${sidebarTextHsl.s}% ${sidebarTextHsl.l}%`;

  return cssVariables;
}

export function applyTheme() {
  const variables = generateThemeVariables();
  const root = document.documentElement;

  Object.entries(variables).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}
