/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./src/app/**/*.{js,jsx}",
    "./src/components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4fb",
          100: "#d6e4f5",
          200: "#aac6e8",
          300: "#75a1d6",
          400: "#4078c0",
          500: "#1f4fa0",
          600: "#163d82",
          700: "#102f66",
          800: "#0c2350",
          900: "#0a1c40",
          950: "#06122b",
        },
      },
      fontFamily: {
     sans: ["var(--font-jakarta)", "system-ui", "sans-serif"],
  },
      boxShadow: {
        soft: "0 1px 2px rgba(16,47,102,0.06), 0 8px 24px rgba(16,47,102,0.08)",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        fadeIn: "fadeIn 0.25s ease-out",
      },
    },
  },
  plugins: [],
};
