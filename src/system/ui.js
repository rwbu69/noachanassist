import pc from 'picocolors';

export const NOA_WHITE = '#FFFFFF';
export const NOA_BLUE = '#00FFFF';
export const NOA_PURPLE = '#FF00FF';

const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
};

export const hexColor = (hex, text) => {
  const rgb = hexToRgb(hex);
  return rgb ? `\x1b[38;2;${rgb.r};${rgb.g};${rgb.b}m${text}\x1b[0m` : text;
};

export const bgHexColor = (hex, text) => {
  const rgb = hexToRgb(hex);
  return rgb ? `\x1b[48;2;${rgb.r};${rgb.g};${rgb.b}m${text}\x1b[0m` : text;
};

export function printThinking() {
  process.stdout.write(pc.dim(pc.gray('Noa-chan is thinking...')));
}

export function clearThinking() {
  process.stdout.write('\x1b[2K\r');
}
