/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/views/**/*.html",
        "./src/js/**/*.js",
    ],
    theme: {
        extend: {
            colors: {
                ivory: "#FFFFF7",
                cream: "#FDF6EC",
                sage: "#9CAF88",
                "sage-light": "#C5CFB7",
                "sage-dark": "#7A8B6A",
                forest: "#2D4A3E",
                "forest-light": "#3D5F52",
                blush: "#E8C4C4",
                "blush-light": "#F7E8E8",
                beige: "#E8DDD0",
                "beige-light": "#F5F0E8",
                rose: "#C49191",
                "rose-dark": "#A87575",
                charcoal: "#2B2B2B",
                stone: "#5A5A5A",
            },
            fontFamily: {
                display: ['"Playfair Display"', "serif"],
                body: ["Inter", "sans-serif"],
            },
            maxWidth: {
                container: "1240px",
            },
        },
    },
    plugins: [],
};