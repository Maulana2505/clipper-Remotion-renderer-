import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#08080a",
        panel: "#111114",
        panel2: "#17171b",
        lime: "#ccff00",
        cyan: "#00e5ff",
      },
      fontFamily: {
        display: ["Anton", "Impact", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        condensed: ["Oswald", "Arial Narrow", "sans-serif"],
      },
      boxShadow: {
        lime: "0 0 40px rgba(204, 255, 0, 0.18)",
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(circle at 50% 0%, rgba(204,255,0,0.12), transparent 45%), linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
      },
      backgroundSize: {
        grid: "100% 100%, 48px 48px, 48px 48px",
      },
    },
  },
  plugins: [],
};

export default config;
