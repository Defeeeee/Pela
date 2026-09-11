/**
 * El índice del día hábil, compartido por todos los puzzles diarios del sitio.
 *
 * Cuenta días hábiles desde EPOCH salteando fines de semana y feriados
 * argentinos. El índice hace doble función: elige el puzzle del día —así no se
 * "gastan" puzzles el fin de semana, cuando el sitio está cerrado— y permite que
 * la racha tolere los días en que nadie pudo jugar.
 *
 * Vive acá y no dentro de la ruta de Pelardle porque ahora hay más de un juego
 * diario. Duplicar un cálculo de fechas con feriados es la forma más segura de
 * que dos juegos terminen sin coincidir en qué día es, y entonces uno de los dos
 * rankee contra la escena equivocada.
 */

const EPOCH = "2026-01-01";
const TZ = "America/Argentina/Buenos_Aires";

// Cache de feriados por año, con el mismo criterio que proxy.js: 12 horas.
const cacheFeriados = new Map();
const TTL = 1000 * 60 * 60 * 12;

export async function feriadosDelAnio(anio) {
  const guardado = cacheFeriados.get(anio);
  if (guardado && Date.now() - guardado.fetchedAt < TTL) return guardado.data;
  try {
    const res = await fetch(`https://api.argentinadatos.com/v1/feriados/${anio}`);
    if (!res.ok) return null;
    const data = await res.json();
    cacheFeriados.set(anio, { data, fetchedAt: Date.now() });
    return data;
  } catch (e) {
    // Sin feriados el índice queda apenas corrido, y eso es mucho mejor que
    // caerse: el puzzle del día se sirve igual.
    return null;
  }
}

/** Fecha YYYY-MM-DD en hora argentina. Nunca UTC: el puzzle cambiaría a las 21. */
export function fechaArgentina(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

/**
 * Índice del día hábil correspondiente a `fechaStr`, y si hoy el sitio abre.
 *
 * Devuelve `{ index, open }`. El índice arranca en 1.
 */
export async function diaHabil(fechaStr) {
  const inicio = new Date(`${EPOCH}T00:00:00Z`);
  const fin = new Date(`${fechaStr}T00:00:00Z`);

  const feriados = new Set();
  for (let y = inicio.getUTCFullYear(); y <= fin.getUTCFullYear(); y++) {
    const fs = await feriadosDelAnio(y);
    if (Array.isArray(fs)) {
      for (const f of fs) {
        if (f?.fecha) feriados.add(String(f.fecha).slice(0, 10));
      }
    }
  }

  const abre = (iso, dow) => dow !== 0 && dow !== 6 && !feriados.has(iso);

  let index = 0;
  let abreHoy = false;
  const cur = new Date(inicio);
  while (cur <= fin) {
    const iso = cur.toISOString().slice(0, 10);
    const open = abre(iso, cur.getUTCDay());
    if (open) index++;
    if (iso === fechaStr) abreHoy = open;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return { index: Math.max(1, index), open: abreHoy };
}

/** El índice de hoy, que es lo que pide casi todo el mundo. */
export async function diaHabilDeHoy() {
  return diaHabil(fechaArgentina());
}
