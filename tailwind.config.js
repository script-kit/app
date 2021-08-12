/* eslint-disable prettier/prettier */
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
        /^bg/,
        /^self/,
        /^italic/,
        /^min/,
        /^max/,
        /^grid/,
        /^\w{0,2}-(\d\/\d|\d\.\d|\d{1,3}|full|screen|auto)/,
      ],
    },
  },
  darkMode: 'media',
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono'],
        // sans: ['Lato'],
      },
      margin: {
        '-2': '-2px',
      },
      scale: {
        60: '.60',
        65: '.65',
        70: '.70',
      },
      colors: {
        ...defaultTheme.colors,
        ...colors,
        gray: colors.coolGray,
        primary: {
          light: colors.yellow['400'],
          dark: colors.indigo['600'], // '#4F46E5',
        },
      },
      minWidth: {
        0: '0',
        '1/4': '25%',
        '1/2': '50%',
        '3/4': '75%',
        full: '100%',
      },
      minHeight: {
        64: '16rem',
        128: '32rem',
      },
      fontSize: {
        xxs: ['0.65rem', '0.75rem'],
      },
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
