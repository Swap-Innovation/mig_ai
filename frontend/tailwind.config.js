/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#FFF5F9",
          100: "#FCE4F0",
          200: "#F5B8D4",
          300: "#ED7AAD",
          400: "#E23A88",
          500: "#E20074",
          600: "#B8005E",
          700: "#8F0049",
          800: "#660034",
          900: "#3D001F",
          ink: "#0B1220",
          slate: "#1E293B",
          muted: "#64748B",
          surface: "#F3F4F6",
          card: "#FFFFFF",
          line: "#E5E7EB",
        },
        tm: {
          magenta: "#E20074",
          "magenta-dark": "#B8005E",
          "magenta-light": "#FCE4F0",
          black: "#0B1220",
          ink: "#0B1220",
          charcoal: "#1E293B",
          gray: {
            50: "#F3F4F6",
            100: "#EEF2F7",
            200: "#E5E7EB",
            300: "#CBD5E1",
            400: "#94A3B8",
            500: "#64748B",
            600: "#475569",
            700: "#334155",
          },
        },
        good: "#047857",
        warn: "#B45309",
        bad: "#B91C1C",
      },
      fontFamily: {
        sans: [
          "IBM Plex Sans",
          "Segoe UI",
          "Helvetica Neue",
          "Arial",
          "system-ui",
          "sans-serif",
        ],
        display: [
          "IBM Plex Sans",
          "Segoe UI",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 0 rgba(11,18,32,0.04)",
        header: "0 1px 0 rgba(11,18,32,0.06)",
        elev: "0 8px 24px rgba(11,18,32,0.08)",
      },
      backgroundImage: {
        "brand-hero":
          "radial-gradient(1200px 600px at 10% -10%, rgba(226,0,116,0.16), transparent 55%), radial-gradient(900px 500px at 90% 0%, rgba(15,23,42,0.08), transparent 50%), linear-gradient(180deg, #F8FAFC 0%, #F3F4F6 100%)",
      },
    },
  },
  plugins: [],
};
