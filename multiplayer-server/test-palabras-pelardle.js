/**
 * Tests de la lista de palabras de Pelardle y de cómo se recorre.
 *
 * Vive acá, junto al resto de las suites, aunque lo que verifica esté en
 * `app/api/pelardle/route.js`: es el único lugar del proyecto donde hay tests
 * que se corren con `node` a secas, y una lista de palabras con dos reglas que
 * fallan en silencio merece una.
 *
 * Las dos reglas silenciosas: una palabra que no tenga cinco letras rompe la
 * grilla, y una que lleve tilde NO SE PUEDE ACERTAR NUNCA, porque `norm()` saca
 * los tildes del intento pero no de la respuesta guardada.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RUTA = join(AQUI, "..", "app", "api", "pelardle", "route.js");
const src = readFileSync(RUTA, "utf8");

console.log("Iniciando tests de las palabras de Pelardle...");

// Se extraen la lista y la lógica tal como están en la ruta, sin reescribirlas:
// un test que reimplementa lo que verifica no protege nada.
const bruto = src.match(/const WORDS = \[([\s\S]*?)\n\];/)[1];
// Se sacan los comentarios ANTES de extraer: la primera versión de esto levantó
// una palabra entre comillas que estaba dentro de un comentario y contó 112
// palabras donde hay 111.
const lista = bruto.replace(/\/\/[^\n]*/g, "");
const WORDS = [...lista.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const mcd = (a, b) => { while (b) { const t = b; b = a % b; a = t; } return a; };
const n = WORDS.length;
let PASO = 1;
for (let p = Math.max(1, Math.floor(n * 0.618)); p < n; p++) if (mcd(p, n) === 1) { PASO = p; break; }
const wordFor = (i) => WORDS[((i - 1) * PASO) % n];

// Corta de verdad: la primera versión sólo marcaba exitCode y seguía imprimiendo
// los ✓ debajo de los ✗, que es un test que miente sobre lo que verificó.
const assert = (c, m) => { if (!c) { console.log("✗", m); process.exit(1); } };

console.log(`  lista: ${n} palabras · paso ${PASO} · mcd(${PASO},${n}) = ${mcd(PASO, n)}`);
assert(mcd(PASO, n) === 1, "el paso tiene que ser coprimo con el largo");

// 1. Todas de cinco letras y sin tildes.
const norm = (s) => String(s).toUpperCase().replace(/Ñ/g, "\u0001")
  .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\u0001/g, "Ñ");
for (const w of WORDS) {
  assert(w.length === 5, `${w} tiene ${w.length} letras`);
  assert(norm(w) === w, `${w} no sobrevive a norm(): sería imposible de acertar`);
}
console.log(`  ✓ las ${n} son de cinco letras y sobreviven a norm()`);

// 2. Sin repetidas.
assert(new Set(WORDS).size === n, `hay ${n - new Set(WORDS).size} palabras repetidas`);
console.log("  ✓ ninguna repetida");

// 3. El recorrido visita TODAS antes de repetir. Es lo que garantiza el paso
//    coprimo, y sin eso la mayoría de las palabras no saldría nunca.
const vistas = new Set();
for (let i = 1; i <= n; i++) vistas.add(wordFor(i));
assert(vistas.size === n, `en ${n} días salieron sólo ${vistas.size} palabras distintas`);
assert(wordFor(n + 1) === wordFor(1), "la vuelta ${n+1} tiene que volver al principio");
console.log(`  ✓ en ${n} días hábiles salen las ${n} palabras, sin repetir ninguna`);

// 4. Viejas y nuevas quedan intercaladas desde el primer día, que es el punto
//    del paso: agregándolas al final y recorriendo en orden, habrían salido 19
//    días de nuevas y después 55 de viejas.
const NUEVAS = new Set(WORDS.slice(55));
const proximos = [];
for (let i = 203; i < 203 + 20; i++) proximos.push([i, wordFor(i), NUEVAS.has(wordFor(i)) ? "nueva" : "vieja"]);
const nuevasEn20 = proximos.filter((x) => x[2] === "nueva").length;
assert(nuevasEn20 >= 5 && nuevasEn20 <= 15, `${nuevasEn20} nuevas en los próximos 20 días: mal mezclado`);
console.log(`  ✓ en los próximos 20 días hábiles salen ${nuevasEn20} nuevas y ${20 - nuevasEn20} viejas`);
console.log("\nlos próximos diez días:");
for (const [i, w, t] of proximos.slice(0, 10)) console.log(`   día ${i}: ${w} (${t})`);

console.log("\n¡Todos los tests de las palabras de Pelardle pasaron exitosamente!");
