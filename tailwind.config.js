module.exports = {
  purge: {
    enabled: true,
    content: ["./static/**/*.html", "./static/**/*.js", "./static/**/*.ts"],
  },
  darkMode: false, // or 'media' or 'class'
  theme: {
    extend: {
      width: {
        "7/24": "29.166666666%",
      },
    },
  },
  variants: {
    extend: {
      opacity: ["disabled"],
      flexWrap: ["responsive"],
    },
  },
  plugins: [],
};
