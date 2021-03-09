const defaultTheme = require('tailwindcss/defaultTheme');
const colors = require('tailwindcss/colors');

/* eslint-disable global-require */
module.exports = {
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
        /^italic/,
        /^\w{0,2}-(\d\/\d|\d\.\d|\d{1,3}|full|screen|auto)/,
      ],
    },
  },
  darkMode: 'media', // or 'media' or 'class'
  theme: {
    colors: {
      ...defaultTheme.colors,
      ...colors,
      gray: colors.trueGray, // colors.coolGray, colors.blueGray, etc.
    },
    extend: {},
  },
  variants: {
    extend: {},
  },
  plugins: [require('@tailwindcss/forms')],
};
