export const scriptKitTheme = `
:root {
    --name: "Script Kit Dark";
    --appearance: dark;
    --opacity-mac: 0.25;
    --opacity-win: 0.5;
    --opacity-other: 0.5;
    --opacity: 0.5;
    --color-text: #ffffffee;
    --color-primary: #fbbf24ee;
    --color-secondary: #ffffff;
    --color-background: #0f0f0f;
    --ui-bg-opacity: 0.08;
    --ui-border-opacity: 0.1;
    --mono-font: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    --sans-font: ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';
    --serif-font: 'ui-serif', 'Georgia', 'Cambria', '"Times New Roman"', 'Times', 'serif';
}
`;

export const scriptKitLightTheme = `
:root {
    --name: "Script Kit Light";
    --appearance: light;
    --opacity-mac: 0.5;
    --opacity-win: 0.9;
    --opacity-other: 0.9;
    --opacity: 0.9;
    --color-text: #2C2C2C;
    --color-primary: #2F86D3;
    --color-secondary: #2F86D3;
    --color-background: #ffffff;
    --ui-bg-opacity: 0.15;
    --ui-border-opacity: 0.15;
    --mono-font: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    --sans-font: ui-sans-serif, system-ui, sans-serif, 'Apple Color Emoji',
    'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji';
    --serif-font: 'ui-serif', 'Georgia', 'Cambria', '"Times New Roman"', 'Times',
    'serif';
  }
`;

export const getThemes = () => ({
  scriptKitTheme,
  scriptKitLightTheme,
});

export const selectTheme = (shouldUseDarkColors: boolean) =>
  shouldUseDarkColors ? scriptKitTheme : scriptKitLightTheme;