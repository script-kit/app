export type Action = {
  name: string;
  shortcut: string;
  position: 'left' | 'right';
  key: string;
  value: string;
  flag: string;
  disabled: boolean;
  arrow?: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

export const bg = `
bg-text-base/0
hover:bg-text-base/10
focus:bg-text-base/20
`;

export const textContrast = 'text-primary/90';

export const transition = { duration: 0.2, ease: 'easeInOut' };
