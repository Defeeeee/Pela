/**
 * Tests de la lista de palabras de Pelardle y de cómo se elige la del día.
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
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RUTA = join(AQUI, "..", "app", "api", "pelardle", "route.js");
const src = readFileSync(RUTA, "utf8");

console.log("Iniciando tests de las palabras de Pelardle...");

/**
 * Extrae un arreglo de palabras del código de la ruta.
 *
 * Los comentarios se sacan ANTES de buscar las comillas: la primera versión de
 * esto levantó una palabra que estaba dentro de un comentario y contó 112 donde
 * hay 101.
 */
function listaDe(nombre) {
  const bruto = src.match(new RegExp(`const ${nombre} = \\[([\\s\\S]*?)\\n\\];`))[1];
  return [...bruto.replace(/\/\/[^\n]*/g, "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

const VIEJAS = listaDe("VIEJAS");
const TANDA_2 = listaDe("TANDA_2");
const TODAS = [...VIEJAS, ...TANDA_2];
const DIA_TANDA_2 = Number(src.match(/const DIA_TANDA_2 = (\d+);/)[1]);

const mcd = (a, b) => { while (b) { const t = b; b = a % b; a = t; } return a; };
const pasoPara = (n) => {
  for (let p = Math.max(1, Math.floor(n * 0.618)); p < n; p++) if (mcd(p, n) === 1) return p;
  return 1;
};
const wordFor = (i) => {
  if (i < DIA_TANDA_2) return VIEJAS[(i - 1) % VIEJAS.length];
  const desde = i - DIA_TANDA_2;
  if (desde < TANDA_2.length) return TANDA_2[(desde * pasoPara(TANDA_2.length)) % TANDA_2.length];
  const resto = desde - TANDA_2.length;
  return VIEJAS[(resto * pasoPara(VIEJAS.length)) % VIEJAS.length];
};

// 1. Las dos reglas que fallan en silencio
{
  const norm = (s) => String(s).toUpperCase().replace(/Ñ/g, "\u0001")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\u0001/g, "Ñ");
  for (const w of TODAS) {
    assert.strictEqual(w.length, 5, `${w} tiene ${w.length} letras: rompe la grilla`);
    assert.strictEqual(norm(w), w, `${w} no sobrevive a norm(): sería imposible de acertar`);
    assert.match(w, /^[A-ZÑ]{5}$/, `${w} tiene algo que no es letra`);
  }
  console.log(`  ✓ Las ${TODAS.length} palabras son de cinco letras y sobreviven a norm()`);
}

// 2. Ninguna repetida entre las dos listas
{
  assert.strictEqual(new Set(TODAS).size, TODAS.length,
    `Hay ${TODAS.length - new Set(TODAS).size} palabras repetidas entre VIEJAS y TANDA_2`);
  console.log(`  ✓ ${VIEJAS.length} viejas + ${TANDA_2.length} nuevas, ninguna repetida`);
}

// 3. El día 203 sigue dando ACTAS
{
  /**
   * EL TEST QUE IMPORTA MÁS DE TODOS, porque documenta un error real: un
   * recorrido a saltos sobre la lista unificada movió la palabra del día 203 de
   * ACTAS a CALVO **a mitad del día**, con gente que ya había jugado. La palabra
   * de un día que ya pasó no puede cambiar retroactivamente.
   */
  assert.strictEqual(wordFor(203), "ACTAS", "El día 203 fue ACTAS y tiene que seguir siéndolo");
  assert.strictEqual(wordFor(1), VIEJAS[0]);
  assert.strictEqual(wordFor(56), VIEJAS[0], "El día 56 cerró la primera vuelta");
  console.log("  ✓ El pasado no se reescribe: el día 203 sigue dando ACTAS");
}

// 4. Las palabras ya jugadas NO vuelven hasta que se agoten las nuevas
{
  /**
   * Es el pedido explícito y la razón de que las dos listas estén separadas. Las
   * 55 viejas se jugaron tres o cuatro veces cada una —la lista se agotó y dio
   * tres vueltas enteras antes del día 203— así que servirlas ahora sería
   * repetirle a todo el mundo algo que ya jugó.
   */
  const yaJugadas = new Set();
  for (let dia = 1; dia < DIA_TANDA_2; dia++) yaJugadas.add(wordFor(dia));
  assert.strictEqual(yaJugadas.size, VIEJAS.length,
    "Antes del día 204 se jugaron las 55 viejas, así que todas cuentan como vistas");

  const salen = [];
  for (let dia = DIA_TANDA_2; dia < DIA_TANDA_2 + TANDA_2.length; dia++) {
    const w = wordFor(dia);
    assert.ok(!yaJugadas.has(w), `El día ${dia} repite ${w}, que ya se había jugado`);
    salen.push(w);
  }
  assert.strictEqual(new Set(salen).size, TANDA_2.length,
    "Las 46 nuevas tienen que salir cada una exactamente una vez");
  console.log(`  ✓ Los ${TANDA_2.length} días siguientes al 203 son todos palabras nuevas, cada una una sola vez`);
}

// 5. Recién después vuelven las viejas, y sin saltearse ninguna
{
  const vuelta = [];
  const desde = DIA_TANDA_2 + TANDA_2.length;
  for (let dia = desde; dia < desde + VIEJAS.length; dia++) vuelta.push(wordFor(dia));
  assert.strictEqual(new Set(vuelta).size, VIEJAS.length,
    `En la vuelta a las viejas salieron ${new Set(vuelta).size} de ${VIEJAS.length}`);
  console.log(`  ✓ Al agotarse la tanda vuelven las ${VIEJAS.length} viejas, cada una una sola vez`);
}

// 6. Los temas salen mezclados y no en bloques
{
  /**
   * Recorrer la tanda en orden daría doce días seguidos de palabras capilares y
   * después dieciséis de trámites, que se nota. El paso coprimo las mezcla sin
   * perder la garantía de que salgan todas.
   */
  const tema = (w) => {
    const i = TANDA_2.indexOf(w);
    return i < 12 ? "capilar" : i < 28 ? "burocrático" : "lunfardo";
  };
  let corridaMax = 1, corrida = 1;
  let anterior = null;
  for (let dia = DIA_TANDA_2; dia < DIA_TANDA_2 + TANDA_2.length; dia++) {
    const t = tema(wordFor(dia));
    corrida = t === anterior ? corrida + 1 : 1;
    corridaMax = Math.max(corridaMax, corrida);
    anterior = t;
  }
  assert.ok(corridaMax <= 4, `Salen ${corridaMax} días seguidos del mismo tema: se nota el bloque`);
  console.log(`  ✓ Los temas salen mezclados: nunca más de ${corridaMax} días seguidos del mismo`);
}

// 7. Los próximos diez días, para mirarlos a ojo
{
  console.log("\n  los próximos diez días hábiles:");
  for (let dia = 204; dia < 214; dia++) {
    const w = wordFor(dia);
    console.log(`     día ${dia}: ${w} ${TANDA_2.includes(w) ? "(nueva)" : "(vieja — NO debería)"}`);
  }
}

console.log("\n¡Todos los tests de las palabras de Pelardle pasaron exitosamente!");
