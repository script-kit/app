export type Action = {
  name: string;
  shortcut: string;
  position: 'left' | 'right';
  key: string;
  value: string;
  flag: string;
  disabled: boolean;
  arrow?: string;
};

export const bg = `
bg-text-base bg-opacity-0
hover:bg-opacity-10
focus:bg-opacity-20
`;

export const textContrast = `text-primary text-opacity-90`;

export const transition = { duration: 0.2, ease: 'easeInOut' };
