module.exports = {
    purge: {
      // enabled: true,
      content: ['./static/**/*.html', './static/**/*.js'],
    },
    darkMode: false, // or 'media' or 'class'
    theme: {
      extend: {},
    },
    variants: {
      extend: {
        opacity: ['disabled'],
        flexWrap: ['responsive'],
      },
    },
    plugins: [],
  }
  