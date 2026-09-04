import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const WORD_LENGTH = 5;
const MAX_ATTEMPTS = 6;
const EPOCH = "2026-01-01";
const TZ = "America/Argentina/Buenos_Aires";

// Padrón Folicular: la palabra nunca viaja al cliente hasta que el juego termina.
const WORDS = [
  // Capilar
  "CALVO", "CALVA", "GORRA", "GORRO", "PEINE", "CASPA", "MECHA", "RULOS",
  "CANAS", "FLECO", "PELON", "LACIO", "RIZOS", "VELLO", "BARBA", "CUERO",
  "PLUMA", "ONDAS", "PELOS", "MOÑOS", "PELAR", "RAPAR", "CREMA", "CORTE",
  "PALAS",
  // Burocrático
  "SELLO", "FIRMA", "COIMA", "CURRO", "MULTA", "COPIA", "OBLEA", "TURNO",
  "CUOTA", "PLAZO", "FOLIO", "ANEXO", "ACTAS", "FICHA", "TASAS",
  // Lunfardo
  "ÑOQUI", "MATES", "GUITA", "BONDI", "ASADO", "CHAPA", "GROSO", "PIBES",
  "CHORI", "VAGOS", "YERBA", "MANGO", "CACHO", "TACHO", "FACHA"
];

const RESOLUCIONES = [
  "Expediente archivado por agotamiento de instancias. La palabra era",
  "Se declara la caducidad del trámite por vencimiento de los seis intentos reglamentarios. La palabra era",
  "Vista la insuficiencia de idoneidad léxico-capilar del solicitante, se informa que la palabra era",
  "Por Resolución Interna de la Secretaría de Foliculización, se desestima el reclamo. La palabra era",
  "El Comité de Redacción Folicular lamenta comunicar que la palabra era"
];

// Cache de feriados por año (mismo criterio que proxy.js: 12hs)
const holidaysCache = new Map();
const CACHE_TTL = 1000 * 60 * 60 * 12;

async function fetchHolidaysForYear(year) {
  const cached = holidaysCache.get(year);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.data;
  try {
    const res = await fetch(`https://api.argentinadatos.com/v1/feriados/${year}`);
    if (!res.ok) return null;
    const data = await res.json();
    holidaysCache.set(year, { data, fetchedAt: Date.now() });
    return data;
  } catch (e) {
    return null;
  }
}

/**
 * Normaliza a mayúsculas sin tildes, PERO conservando la Ñ.
 * normalize("NFD") descompone la Ñ en N + tilde, así que hay que blindarla antes.
 */
function norm(str) {
  return String(str || "")
    .toUpperCase()
    .replace(/\u00d1/g, "\u0001")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0001/g, "\u00d1");
}

/** Fecha YYYY-MM-DD en hora argentina (nunca UTC: el puzzle cambiaría a las 21:00). */
function arDateString(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

/**
 * Cuenta días hábiles desde EPOCH hasta dateStr inclusive, salteando finde y feriados.
 * El índice hace doble función: elige la palabra (no se "gastan" palabras el finde)
 * y permite que la racha del cliente tolere los días en que el sitio está cerrado.
 */
async function workingDayInfo(dateStr) {
  const start = new Date(`${EPOCH}T00:00:00Z`);
  const end = new Date(`${dateStr}T00:00:00Z`);

  const holidaySet = new Set();
  for (let y = start.getUTCFullYear(); y <= end.getUTCFullYear(); y++) {
    const hs = await fetchHolidaysForYear(y);
    if (Array.isArray(hs)) {
      for (const h of hs) {
        if (h?.fecha) holidaySet.add(String(h.fecha).slice(0, 10));
      }
    }
  }

  const isWorking = (iso, dow) => dow !== 0 && dow !== 6 && !holidaySet.has(iso);

  let index = 0;
  let openToday = false;
  const cur = new Date(start);
  while (cur <= end) {
    const iso = cur.toISOString().slice(0, 10);
    const open = isWorking(iso, cur.getUTCDay());
    if (open) index++;
    if (iso === dateStr) openToday = open;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return { index: Math.max(1, index), open: openToday };
}

function wordFor(index) {
  return WORDS[(index - 1) % WORDS.length];
}

/**
 * Dos pasadas: primero los verdes, después los amarillos consumiendo de un pool.
 * Sin el pool, una palabra con letras repetidas pinta amarillos de más.
 */
function scoreGuess(guess, answer) {
  const result = Array(WORD_LENGTH).fill("absent");
  const pool = {};

  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === answer[i]) result[i] = "correct";
    else pool[answer[i]] = (pool[answer[i]] || 0) + 1;
  }

  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] === "correct") continue;
    if (pool[guess[i]] > 0) {
      result[i] = "present";
      pool[guess[i]]--;
    }
  }

  return result;
}

export async function GET() {
  const fecha = arDateString();
  const { index, open } = await workingDayInfo(fecha);

  return NextResponse.json({
    puzzle: index,
    length: WORD_LENGTH,
    attempts: MAX_ATTEMPTS,
    open,
    fecha,
    aviso: open
      ? null
      : "El Comité de Redacción Folicular no sesiona sábados, domingos ni feriados. La palabra vigente es la del último día hábil."
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const guess = norm(body.guess);

    if (guess.length !== WORD_LENGTH || !/^[A-ZÑ]+$/.test(guess)) {
      return NextResponse.json({
        status: "invalid",
        message: `El formulario requiere exactamente ${WORD_LENGTH} letras del alfabeto nacional.`
      });
    }

    const fecha = arDateString();
    const { index } = await workingDayInfo(fecha);
    const answer = wordFor(index);

    const result = scoreGuess(guess, answer);
    const solved = guess === answer;

    // Registrar intento contra el servicio multijugador (autoridad central anti-trampa)
    let attempt = parseInt(body.attempt, 10) || 1;
    const playerId = body.playerId || "anon";
    const playerName = body.playerName || "Pelado Anónimo";

    try {
      const mpRes = await fetch("http://127.0.0.1:9315/pelardle/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          puzzle: index,
          playerId,
          playerName,
          guess,
          solved,
        }),
        signal: AbortSignal.timeout(1500),
      });

      if (mpRes.ok) {
        const mpData = await mpRes.json();
        if (mpData && typeof mpData.attempt === "number") {
          attempt = mpData.attempt;
        }
      }
    } catch (_svcErr) {
      // Tolerancia a fallos: degradar al attempt del cliente si el servicio está caído
    }

    const exhausted = !solved && attempt >= MAX_ATTEMPTS;

    const payload = { status: "ok", puzzle: index, guess, result, solved, attempt };

    if (solved || exhausted) {
      payload.answer = answer;
    }
    if (exhausted) {
      payload.resolucion = `${RESOLUCIONES[index % RESOLUCIONES.length]} "${answer}".`;
    }

    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json({
      status: "invalid",
      message: "Mesa de entradas no pudo procesar el intento. Reintente el trámite."
    });
  }
}
