/* eslint-disable prettier/prettier */
const defaultTheme = require('tailwindcss/defaultTheme');
const colors = require('tailwindcss/colors');
const peers = require('tailwindcss/peers');

delete colors.lightBlue;
delete colors.coolGray;
delete colors.blueGray;
delete colors.trueGray;
delete colors.warmGray;

const colorVar = (name, opacityName) => (v) => {
  const { opacityVariable, opacityValue } = v;

  if (typeof opacityName === 'number') {
    return `rgba(var(--color-${name}), ${opacityName})`;
  }

  if (opacityName !== undefined) {
    return `rgba(var(--color-${name}), var(--${opacityName}))`;
  }
  if (opacityValue !== undefined) {
    return `rgba(var(--color-${name}), ${opacityValue})`;
  }

  if (opacityVariable !== undefined) {
    return `rgba(var(--color-${name}), var(${opacityVariable}, 1))`;
  }
  return `rgb(var(--color-${name}))`;
};

const round = (num) =>
  num
    .toFixed(7)
    .replace(/(\.[0-9]+?)0+$/, '$1')
    .replace(/\.0$/, '');
const rem = (px) => `${round(px / 16)}rem`;
const em = (px, base) => `${round(px / base)}em`;

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
  `w{0,2}-(\d\/\d|\d.\d|\d{1,3}|full|screen|auto)`,
  'leading',
  'prose',
  'focus',
  'prose-sm',
  '-?inset',
  '-?top',
  '-?right',
  '-?bottom',
  '-?left',
  'border-b',
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
  variants: {
    extend: {
      borderWidth: ['hover'],
    },
  },
  theme: {
    // Add your custom filter here
    dropShadow: {
      'primary-glow': '0 0 10px var(--color-primary)',
      'secondary-glow': '0 0 10px var(--color-secondary)',
    },
    colors: {
      ...defaultTheme.colors,
      ...colors,
      gray: colors.coolGray,
      primary: colorVar('primary'),
      'primary-25': colorVar('primary', 0.25),
      'primary-50': colorVar('primary', 0.5),
      'primary-75': colorVar('primary', 0.75),
      secondary: colorVar('secondary'),
      'ui-bg': colorVar('secondary', 'ui-bg-opacity'),
      'ui-border': colorVar('secondary', 'ui-border-opacity'),
      'ui-text': colorVar('secondary', 'ui-border-opacity'),
      contrast: colorVar('contrast'),
      gradient: {
        white: '#ffffffcc',
        dark: '#4F46E511',
      },
      bg: {
        base: colorVar('background'),
      },
      text: {
        base: colorVar('text'),
      },
    },
    extend: {
      keyframes: {
        'spin-pulse': {
          from: {
            transform: 'rotate(90deg)',
            filter: 'brightness(70%)',
          },

          to: {
            transform: 'rotate(450deg)',
            filter: 'brightness(70%)',
          },
        },
        'pulse-background': {
          '0%, 100%': {
            marginLeft: '0px',
          },
          '50%': { marginLeft: '10px' },
        },
        'ping-emoji': {
          '0%': {
            transform: 'scale(.75)',
          },
        },
        'pulse-emoji': {
          '100%': {
            transform: 'scale(2)',
            opacity: 0,

            filter:
              'drop-shadow(0 0 5px var(--color-secondary)) brightness(0%)',
          },
        },
      },
      animation: {
        'pulse-background': 'pulse-background ease-in-out 3s infinite',
        'ping-emoji': 'ping-emoji 1.5s ease-in-out infinite',
        'pulse-emoji': 'pulse-emoji 1.5s ease-in-out infinite',
        'spin-pulse': 'spin-pulse 1.2s linear infinite',
      },
      backgroundImage: (theme) => ({
        'random-shapes': "url('/src/svg/ui/random-shapes.svg')",
      }),
      fontFamily: {
        sans: ['var(--sans-font)'],
        serif: ['var(--serif-font)'],
        mono: ['var(--mono-font)'],
        native: ['var(--native-font)'],
        ui: ['var(--ui-font)'],
      },
      margin: {
        '2px': '2px',
        '3px': '3px',
      },
      padding: {
        '2px': '2px',
        '3px': '3px',
        '4px': '4px',
      },
      scale: {
        60: '.60',
        65: '.65',
        70: '.70',
      },
      // add border-t-1
      borderWidth: {
        1: '1px',
      },
      opacity: {
        3: '.03',
        12: '.12',
        15: '.15',
        18: '.18',
        40: '.40',
        base: 'var(--opacity)',
      },
      minWidth: {
        0: '0',
        '1/4': '25%',
        '1/2': '50%',
        '3/4': '75%',
        full: '100%',
      },
      height: {
        5.5: '1.375rem',
        6.5: '1.625rem',
        0.75: '0.1875rem',
        11: '2.75rem',
        '2px': '2px',
        '3px': '3px',
        '4px': '4px',
      },
      minHeight: {
        4: '1rem',
        8: '2rem',
        11: '2.75rem',
        52: '14rem',
        64: '16rem',
        128: '32rem',
      },
      maxHeight: {
        5.5: '1.375rem',
        6.5: '1.625rem',
        0.75: '0.1875rem',
        11: '2.75rem',
        '2px': '2px',
        '3px': '3px',
        '4px': '4px',
      },
      fontSize: {
        xxs: ['0.65rem', '0.75rem'],
      },
      typography: (theme) => ({
        DEFAULT: {
          css: {
            '--tw-prose-headings': theme('colors.text.base'),
            '--tw-prose-code': theme('colors.text.base'),
            '--tw-prose-quotes': theme('colors.text.base'),
            '--tw-prose-links': theme('colors.text.base'),
            '--tw-prose-pre-code': theme('colors.text.base'),
            '--tw-prose-bold': theme('colors.text.base'),
            '--tw-prose-italic': theme('colors.text.base'),
            thead: {
              borderBottomColor: theme('colors.ui-border'),
            },
            tr: {
              borderBottomColor: theme('colors.ui-border'),
            },
            maxWidth: '100%',
            color: theme('colors.text.base'),
            a: {
              color: theme('colors.primary'),
            },
            code: {
              padding: '1px 3px',
              borderRadius: 2,
              backgroundColor: 'rgba(0, 0, 0, 0.1)',
            },
            'code:before': {
              content: 'none',
            },
            'code:after': {
              content: 'none',
            },
            li: {
              listStylePosition: 'outside',
            },
            'p:first-of-type, h2:first-of-type, h3:first-of-type': {
              marginTop: 0,
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
              border: `1px solid ${theme('colors.text.base')}`,
            },
            'input:focus-visible': {
              outline: `1px solid ${theme('colors.text.base')}`,
            },
            'input:not([type]),select': {
              border: `1px solid ${theme('colors.text.base')}`,
              color: theme('colors.text.base'),
              padding: '0 2rem 0 0.5rem',
            },
            'input:checked': {
              color: theme('colors.text.base'),
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
              outline: `1px solid ${theme('colors.text.base')}`,
              padding: '0.25rem .5rem',
            },
            'input[type="submit"]:hover': {
              cursor: 'pointer',
              backgroundColor: `rgba(0, 0, 0, 33%)`,
            },
            'ul > li > *:last-child': {
              marginBottom: '.25rem',
            },
            'ul > li::marker': {
              color: theme('colors.text.fade'),
            },
            blockquote: {
              padding: '1rem',
              borderLeft: `2px solid ${theme('colors.primary')}`,
              fontWeight: '400',
              fontStyle: 'normal',
            },
            'blockquote p:first-of-type::before': {
              content: 'none',
            },
            'blockquote p:first-of-type::after': {
              content: 'none',
            },
          },
        },
        sm: {
          css: {
            'p:first-of-type': {
              marginTop: 0,
            },
            'h1:first-of-type': {
              fontSize: em(22, 16),
              marginBottom: em(22, 22),
              paddingBottom: em(16, 22),
              borderBottom: '1px solid rgba(130, 130, 130, 0.50)',
            },
            h1: {
              fontSize: em(24, 16),
              fontWeight: '600',
              fontFamily: theme('fontFamily.ui').join(', '),
              textTransform: 'none',
            },
            h2: {
              fontSize: em(18, 16),
              fontWeight: 'bold',
              fontFamily: theme('fontFamily.ui').join(', '),
              textTransform: 'none',
            },
            h3: {
              fontSize: em(16, 16),
            },
            h4: {
              fontSize: em(14, 16),
            },
            'blockquote p:first-of-type': {
              marginBottom: 0,
            },
          },
        },
      }),
    },
  },
  plugins: [require('@tailwindcss/forms'), require('@tailwindcss/typography')],
};
