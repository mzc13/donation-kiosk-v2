module.exports = {
    purge: {
      // enabled: true,
      content: ['./static/**/*.html', './static/**/*.js', './static/**/*.ts'],
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
  