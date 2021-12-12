/* eslint-disable prettier/prettier */
const defaultTheme = require('tailwindcss/defaultTheme');
const colors = require('tailwindcss/colors');
delete colors['lightBlue'];
delete colors['coolGray'];
delete colors['blueGray'];
delete colors['trueGray'];
delete colors['warmGray'];

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

const safeListStartsWith = [
  'active',
  'animate',
  'hover',
  'hidden',
  'font',
  'flex',
  'justify',
  'space',
  'items',
  'text',
  'bg',
  'self',
  'italic',
  'whitespace',
  'min',
  'max',
  'grid',
  'w{0,2}-(d/d|d.d|d{1,3}|full|screen|auto)',
  'leading',
  'prose',
  'dark:prose-dark',
  '-?inset',
  '-?top',
  '-?right',
  '-?bottom',
  '-?left',
];

/* eslint-disable global-require */
module.exports = {
  mode: process.env.NODE_ENV === 'development' ? 'jit' : '',
  content: [
    './src/**/*.html',
    './src/**/*.tsx',
    './src/*.ts',
    './safelist.txt',
  ],
  safelist: [
    {
      pattern: new RegExp(`^(${safeListStartsWith.join('|')})`),
    },
  ],
  darkMode: 'media',
  variants: {
    extend: {
      borderWidth: ['hover'],
      textOpacity: ['dark'],
      placeholderOpacity: ['dark'],
      typography: ['dark'],
    },
  },
  theme: {
    extend: {
      backgroundImage: (theme) => ({
        'random-shapes': "url('/src/svg/random-shapes.svg')",
      }),
      fontFamily: {
        mono: ['JetBrains Mono'],
      },
      margin: {
        '2px': '2px',
        '3px': '3px',
      },
      padding: {
        '3px': '3px',
      },
      scale: {
        60: '.60',
        65: '.65',
        70: '.70',
      },
      opacity: {
        12: '.12',
        15: '.15',
        18: '.18',
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
          white: '#ffffffcc',
          dark: '#4F46E511',
        },
      },
      minWidth: {
        0: '0',
        '1/4': '25%',
        '1/2': '50%',
        '3/4': '75%',
        full: '100%',
      },
      height: {
        5.5: '22px',
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
            maxWidth: '100%',
            color: theme('colors.black'),
            a: {
              color: theme('colors.primary.dark'),
            },
            code: {
              padding: '1px 3px',
              borderRadius: 2,
              backgroundColor: theme('colors.gray.100'),
            },
            'code:before': {
              content: '""',
            },
            'code:after': {
              content: '""',
            },
            li: {
              listStylePosition: 'outside',
            },
            'p:first-of-type, h2:first-of-type, h3:first-of-type': {
              marginTop: 0,
            },
            pre: {
              background: theme('colors.white'),
            },
            'pre > code': {
              color: theme('colors.black'),
              fontSize: '95%',
            },
            'p > label': {
              paddingTop: '5rem',
            },
            input: {
              margin: '0 .25rem 0 .75rem',
            },
            select: {
              margin: '0 .75rem 0 .5rem',
            },
            'input:focus': {
              border: `1px solid ${theme('colors.black')}`,
            },
            'input:focus-visible': {
              outline: `1px solid ${theme('colors.black')}`,
            },
            'input:not([type]),select': {
              border: `1px solid ${theme('colors.black')}`,
              color: theme('colors.black'),
              padding: '0 2rem 0 0.5rem',
            },
            'input:checked': {
              color: theme('colors.black'),
              outline: 'none',
            },
            'input[type="checkbox"]': {
              cursor: 'pointer',
            },
            'input[type="radio"]': {
              cursor: 'pointer',
              marginRight: '.5rem',
            },
            'input[type="submit"]': {
              outline: '1px solid ' + theme('colors.black'),
              padding: '0.25rem .5rem',
            },
            'input[type="submit"]:hover': {
              cursor: 'pointer',
              backgroundColor: `rgba(0, 0, 0, 33%)`,
            },

            'ul > li > *:last-child': {
              marginBottom: '.25rem',
            },
          },
        },
        dark: {
          css: {
            '*': { color: theme('colors.white') },
            'h1, h2, h3, h4, h5': {
              color: theme('colors.white'),
            },
            code: {
              color: theme('colors.white'),
              backgroundColor: theme('colors.gray.800'),
            },
            a: {
              color: theme('colors.primary.light'),
            },
            pre: {
              background: theme('colors.gray.800'),
            },
            'pre > code': {
              color: theme('colors.white'),
            },
            'input:focus': {
              border: `1px solid ${theme('colors.white')}`,
            },
            'input:focus-visible': {
              outline: `1px solid ${theme('colors.white')}`,
            },
            'input:not([type]),select': {
              border: `1px solid ${theme('colors.white')}`,
              color: theme('colors.white'),
              padding: '0 2rem 0 0.5rem',
            },
            'input[type="submit"]': {
              outline: '1px solid white',
              padding: '0.25rem .5rem',
              color: theme('colors.secondary.white'),
            },
            'input[type="submit"]:hover': {
              cursor: 'pointer',
              backgroundColor: `rgba(255, 255, 255, 33%)`,
            },
          },
        },
      }),
    },
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/typography')],
};
