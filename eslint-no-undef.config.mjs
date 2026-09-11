// Configuración mínima con un solo objetivo: cazar identificadores que no
// existen. Es la clase de bug que `node --check` y `next build` NO agarran,
// porque referenciar algo inexistente es JavaScript válido hasta que se ejecuta.
export default [{
  files: ["**/*.js"],
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
    globals: {
      window: "readonly", document: "readonly", navigator: "readonly",
      localStorage: "readonly", fetch: "readonly", console: "readonly",
      setTimeout: "readonly", clearTimeout: "readonly", setInterval: "readonly",
      clearInterval: "readonly", requestAnimationFrame: "readonly",
      cancelAnimationFrame: "readonly", addEventListener: "readonly",
      DeviceOrientationEvent: "readonly", process: "readonly", Image: "readonly",
      performance: "readonly", URLSearchParams: "readonly", atob: "readonly",
      devicePixelRatio: "readonly", crypto: "readonly", Audio: "readonly",
      removeEventListener: "readonly", location: "readonly", alert: "readonly",
      React: "readonly",
    },
  },
  rules: { "no-undef": "error" },
}];
