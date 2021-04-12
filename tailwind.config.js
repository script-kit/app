const defaultTheme = require('tailwindcss/defaultTheme');
const colors = require('tailwindcss/colors');

/* eslint-disable global-require */
module.exports = {
  mode: process.env.NODE_ENV === 'development' ? 'jit' : '',
  purge: {
    enabled: true,
    content: ['./src/**/*.html', './src/**/*.tsx', './src/*.ts'],
    options: {
      safelist: [
        /^font/,
        /^flex/,
        /^justify/,
        /^items/,
        /^text/,
        /^self/,
        /^italic/,
        /^\w{0,2}-(\d\/\d|\d\.\d|\d{1,3}|full|screen|auto)/,
      ],
    },
  },
  darkMode: 'media',
  theme: {
    colors: {
      ...defaultTheme.colors,
      ...colors,
      gray: colors.coolGray,
      primary: {
        dark: colors.amber['600'],
        light: colors.amber['400'],
      },
    },
    extend: {
      typography: (theme) => ({
        DEFAULT: {
          css: {
            color: theme('colors.black'),
            a: {
              color: theme('colors.primary.dark'),
            },
          },
        },
        dark: {
          css: {
            color: theme('colors.white'),
            a: {
              color: theme('colors.primary.light'),
            },
          },
        },
      }),
    },
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/typography')],
};
