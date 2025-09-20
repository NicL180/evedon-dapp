/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // needed for the Day/Night toggle
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
