/* eslint-disable prettier/prettier */
const defaultTheme = require('tailwindcss/defaultTheme');
const colors = require('tailwindcss/colors');

const colorVar = (name) => (v) => {
  const { opacityVariable, opacityValue } = v;
  if (opacityValue !== undefined) {
    return `rgba(var(--color-${name}), ${opacityValue})`;
  }
  if (opacityVariable !== undefined) {
    return `rgba(var(--color-${name}), var(${opacityVariable}, 1))`;
  }
  return `rgb(var(--color-${name}))`;
};

/* eslint-disable global-require */
module.exports = {
  mode: process.env.NODE_ENV === 'development' ? 'jit' : '',
  purge: {
    enabled: true,
    content: ['./src/**/*.html', './src/**/*.tsx', './src/*.ts'],
    options: {
      safelist: [
        /^hover/,
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
  variants: {
    extend: {
      borderWidth: ['hover'],
      textOpacity: ['dark'],
      placeholderOpacity: ['dark'],
    },
  },
  theme: {
    extend: {
      backgroundImage: (theme) => ({
        'random-shapes': "url('/src/svg/random-shapes.svg')",
      }),
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
      opacity: {
        themelight: 'var(--opacity-themelight)',
        themedark: 'var(--opacity-themedark)',
      },
      colors: {
        ...defaultTheme.colors,
        ...colors,
        gray: colors.coolGray,
        bg: {
          dark: colorVar('background-dark'),
          light: colorVar('background-light'),
        },
        primary: {
          light: colorVar('primary-light'),
          dark: colorVar('primary-dark'),
        },
        secondary: {
          light: colorVar('secondary-light'),
          dark: colorVar('secondary-dark'),
        },
        gradient: {
          white: '#ffffff00',
          dark: '#4F46E533',
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
        52: '14rem',
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
