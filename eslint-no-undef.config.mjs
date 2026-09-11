/**
 * Configuración con un solo objetivo: cazar identificadores que no existen.
 *
 * Es la clase de bug que `node --check` y `next build` NO agarran, porque
 * referenciar algo inexistente es JavaScript válido hasta que se ejecuta. Un
 * selector de bots llegó a producción así: su handler nunca se había insertado,
 * los dos chequeos dieron verde, y el control simplemente no hacía nada.
 *
 * Se corre con `npm run check-undef`. El `npm run lint` del proyecto está roto
 * aparte: `next lint` interpreta el argumento "lint" como un directorio.
 */
const navegador = {
  window: "readonly", document: "readonly", navigator: "readonly",
  localStorage: "readonly", sessionStorage: "readonly", location: "readonly",
  fetch: "readonly", Request: "readonly", Response: "readonly", Headers: "readonly",
  setTimeout: "readonly", clearTimeout: "readonly", setInterval: "readonly",
  clearInterval: "readonly", requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly", addEventListener: "readonly",
  removeEventListener: "readonly", devicePixelRatio: "readonly",
  Image: "readonly", Audio: "readonly", alert: "readonly", confirm: "readonly",
  CustomEvent: "readonly", Event: "readonly", DeviceOrientationEvent: "readonly",
  performance: "readonly", crypto: "readonly", atob: "readonly", btoa: "readonly",
  URL: "readonly", URLSearchParams: "readonly", AbortController: "readonly",
  AbortSignal: "readonly", TextEncoder: "readonly", TextDecoder: "readonly",
  ResizeObserver: "readonly", IntersectionObserver: "readonly", Blob: "readonly",
  FileReader: "readonly", FormData: "readonly", WebSocket: "readonly",
};

const nodo = {
  process: "readonly", Buffer: "readonly", global: "readonly",
  __dirname: "readonly", __filename: "readonly", require: "readonly",
  module: "writable", exports: "writable", structuredClone: "readonly",
};

export default [
  {
    ignores: ["**/node_modules/**", ".next/**", "**/training/**", "test-merge*.js"],
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...navegador, ...nodo, console: "readonly", React: "readonly" },
    },
    // Se ignoran los comentarios de desactivación del código: apuntan a reglas
    // de Next que acá no están cargadas, y de paso evita que un
    // `eslint-disable` puesto para otra cosa tape una referencia rota.
    linterOptions: { noInlineConfig: true },
    // Sólo esta regla: no es un linter de estilo, es un detector de referencias
    // rotas. Cualquier otra regla acá sería ruido que haría que nadie lo corra.
    rules: { "no-undef": "error" },
  },
];
