import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Panel de entrenamiento.
 *
 * Sirve una página que lee `estado/metricas.jsonl`, el archivo que el aprendiz
 * va escribiendo. No se mete en el entrenamiento ni le habla: lee el archivo y
 * ya. Así se puede reiniciar el panel, o el entrenamiento, sin tocar al otro.
 */

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PUERTO = Number(process.env.PUERTO || 8421);
const ARCHIVO = process.env.METRICAS || path.join(AQUI, "estado", "metricas.jsonl");

/** Últimas N líneas del jsonl, sin leer el archivo entero. */
function ultimas(n) {
  let datos;
  try {
    const st = fs.statSync(ARCHIVO);
    const tam = Math.min(st.size, 4 * 1024 * 1024); // con 4 MB alcanza y sobra
    const fd = fs.openSync(ARCHIVO, "r");
    const buf = Buffer.alloc(tam);
    fs.readSync(fd, buf, 0, tam, st.size - tam);
    fs.closeSync(fd);
    datos = buf.toString("utf-8");
  } catch (e) {
    return [];
  }

  const lineas = datos.split("\n").filter(Boolean);
  // La primera puede haber quedado cortada por el offset.
  if (lineas.length && !lineas[0].startsWith("{")) lineas.shift();

  const salida = [];
  for (const l of lineas.slice(-n)) {
    try { salida.push(JSON.parse(l)); } catch (e) { /* línea a medio escribir */ }
  }
  return salida;
}

/**
 * Elige a quién mirar entre los volcados de todos los actores.
 *
 * Con enfriamiento: gana el más grande, pero no se cambia de protagonista
 * hasta que pasaron unos segundos, y sólo si el nuevo es bastante más grande.
 * Sin eso, con miles de agentes creciendo y muriendo, la cámara saltaría varias
 * veces por segundo y no se entendería nada.
 */
const ENFRIAMIENTO_MS = 6000;
const VENTAJA_MINIMA = 1.15; // el nuevo tiene que llevar 15% más de vida
let actual = null;
let cambiadoEn = 0;

function elegirEspectador() {
  const dir = path.dirname(ARCHIVO);
  let archivos;
  try {
    archivos = fs.readdirSync(dir).filter((f) => /^espectador-\d+\.json$/.test(f));
  } catch (e) {
    return null;
  }

  const ahora = Date.now();
  const candidatos = [];
  for (const f of archivos) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
      if (ahora - d.ts > 15000) continue; // volcado viejo: ese actor murió
      d.fuente = f;
      candidatos.push(d);
    } catch (e) { /* volcado a medio escribir */ }
  }
  if (!candidatos.length) return null;

  candidatos.sort((a, b) => b.vividoMs - a.vividoMs);
  const mejor = candidatos[0];
  const vigente = candidatos.find((c) => c.fuente === actual);

  if (!vigente) {
    actual = mejor.fuente;
    cambiadoEn = ahora;
    return { ...mejor, cambio: true };
  }
  if (ahora - cambiadoEn > ENFRIAMIENTO_MS &&
      mejor.fuente !== actual &&
      mejor.vividoMs > vigente.vividoMs * VENTAJA_MINIMA) {
    actual = mejor.fuente;
    cambiadoEn = ahora;
    return { ...mejor, cambio: true };
  }
  return { ...vigente, cambio: false, faltaEnfriar: Math.max(0, ENFRIAMIENTO_MS - (ahora - cambiadoEn)) };
}

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");

  if (url.pathname === "/metricas") {
    const n = Math.min(2000, Number(url.searchParams.get("n") || 400));
    const filas = ultimas(n);
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ filas, archivo: ARCHIVO, existe: fs.existsSync(ARCHIVO) }));
    return;
  }

  if (url.pathname === "/espectador") {
    const e = elegirEspectador();
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(e || { vacio: true }));
    return;
  }

  const html = path.join(AQUI, "panel.html");
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(fs.readFileSync(html));
});

servidor.listen(PUERTO, "0.0.0.0", () => {
  console.log(`[panel] http://0.0.0.0:${PUERTO}  leyendo ${ARCHIVO}`);
});
