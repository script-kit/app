const defaultTheme = require('tailwindcss/defaultTheme');
const colors = require('tailwindcss/colors');

/* eslint-disable global-require */
module.exports = {
  purge: false,
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
