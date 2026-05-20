/**
 * Banza Tailwind Theme Extension
 *
 * Canonical Banza brand tokens as a Tailwind CSS plugin.
 * Add to tailwind.config.js presets or extend block.
 *
 * Usage in tailwind.config.js:
 *   const banza = require('../../assets/banza/tokens/tailwind.banza')
 *   module.exports = { presets: [banza] }
 *
 * Then in markup:
 *   <div class="bg-banza-primary text-white" />
 *   <div class="bg-banza-gradient-brand" />
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        banza: {
          primary:          '#990011',
          highlight:        '#c21a2c',
          mid:              '#7a000d',
          shadow:           '#5e000a',
          'surface-light':  '#FCF6F5',
          'surface-neutral':'#d8d0cf',
          'near-black':     '#1a1a1a',
        },
      },
      backgroundImage: {
        'banza-brand':   'linear-gradient(145deg, #c21a2c 0%, #990011 38%, #7a000d 72%, #5e000a 100%)',
        'banza-surface': 'linear-gradient(to bottom, #ffffff 0%, #FCF6F5 55%, #d8d0cf 100%)',
      },
      boxShadow: {
        'banza-icon': '0px 1px 2px rgba(0, 0, 0, 0.08)',
      },
      borderRadius: {
        'banza-icon': '22%',
      },
    },
  },
};
