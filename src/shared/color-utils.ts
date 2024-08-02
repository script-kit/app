import colors from 'color-name';

export const toHex = (hexOrRgbOrName) => {
  if (hexOrRgbOrName.includes(',')) {
    const [r, g, b] = hexOrRgbOrName.split(',').map((c) => Number.parseInt(c.trim(), 10));

    const convert = (c: number) => c.toString(16).padStart(2, '0');

    return `#${convert(r)}${convert(b)}${convert(g)}`;
  }

  if (colors[hexOrRgbOrName]) {
    return colors[hexOrRgbOrName].join(',');
  }

  return hexOrRgbOrName;
};

export const findCssVar = (varName: string) => {
  const style = getComputedStyle(document.documentElement);
  return style.getPropertyValue(varName).trim();
};
