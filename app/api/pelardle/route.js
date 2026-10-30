import { NextResponse } from "next/server";
import { diaHabil, fechaArgentina } from "../../lib/diaHabil";

export const dynamic = "force-dynamic";

const WORD_LENGTH = 5;
const MAX_ATTEMPTS = 6;

// Padrón Folicular: la palabra nunca viaja al cliente hasta que el juego termina.
const VIEJAS = [
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

/**
 * Segunda tanda: las que TODAVÍA NO SALIERON NUNCA.
 *
 * Están aparte de `VIEJAS` y no mezcladas con ellas porque la diferencia
 * importa para elegir la palabra del día: las 55 de arriba ya se jugaron tres o
 * cuatro veces cada una —la lista se agotó y dio tres vueltas enteras antes del
 * día 203— así que no tienen que volver a aparecer hasta que estas 46 se hayan
 * usado. Ver `wordFor`.
 *
 * Se mantienen los TRES temas que el juego ya tenía —capilar, burocrático y
 * lunfardo— a pedido explícito. Hubo un cuarto grupo de palabras de sistemas,
 * por los puzzles de Orga que tiene el sitio, y se sacó: desentonaba con el
 * resto y Pelardle es de pelados, trámites y lunfardo.
 *
 * Toda palabra nueva tiene que cumplir dos reglas que fallan EN SILENCIO:
 * cinco letras exactas (si no, rompe la grilla) y sobrevivir a `norm()` sin
 * cambiar. Lo segundo es lo traicionero: `norm()` saca los tildes del intento
 * pero no de la respuesta, así que una palabra guardada con tilde no se podría
 * acertar nunca. La Ñ sí está blindada y se puede usar.
 */
const TANDA_2 = [
  // Capilar
  "GREÑA", "NUCAS", "CEJAS", "TESTA", "PELAO", "TEÑIR", "MOCHO", "CASCO",
  "MELON", "BOCHA", "MOTAS", "LISOS",
  // Burocrático
  "FOJAS", "VISTO", "PAPEL", "LEYES", "DEUDA", "PAGOS", "CARGO", "JUNTA",
  "CENSO", "SALDO", "RUBRO", "CANON", "BANDO", "VOCAL", "GIROS", "NULOS",
  // Lunfardo
  "MORFI", "CHETO", "GARCA", "POSTA", "PIOLA", "ZAFAR", "FIACA", "PUCHO",
  "GRASA", "BIRRA", "TANGO", "VIEJA", "NAFTA", "SUBTE", "TERMO", "LUCAS",
  "PALOS", "GAMBA",
];

/** Todas juntas, para los tests y para cualquier cosa que necesite el padrón. */
const WORDS = [...VIEJAS, ...TANDA_2];

const RESOLUCIONES = [
  "Expediente archivado por agotamiento de instancias. La palabra era",
  "Se declara la caducidad del trámite por vencimiento de los seis intentos reglamentarios. La palabra era",
  "Vista la insuficiencia de idoneidad léxico-capilar del solicitante, se informa que la palabra era",
  "Por Resolución Interna de la Secretaría de Foliculización, se desestima el reclamo. La palabra era",
  "El Comité de Redacción Folicular lamenta comunicar que la palabra era"
];

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


/**
 * Mayor común divisor, para elegir un paso que recorra la lista entera.
 */
function mcd(a, b) {
  while (b) { const t = b; b = a % b; a = t; }
  return a;
}

/**
 * El paso con el que se recorre una lista.
 *
 * Se busca cerca de la proporción áurea del largo y se corre hasta dar con uno
 * coprimo, que es la condición para que `(i * paso) % largo` visite LAS `largo`
 * POSICIONES antes de repetir ninguna. Sin coprimalidad el recorrido entra en un
 * ciclo corto y la mayoría de las palabras no saldrían nunca.
 *
 * Se deriva del largo, así que agregar o sacar palabras no exige revisarlo a
 * mano.
 */
function pasoPara(n) {
  for (let p = Math.max(1, Math.floor(n * 0.618)); p < n; p++) {
    if (mcd(p, n) === 1) return p;
  }
  return 1; // sólo si la lista tuviera una palabra
}

/**
 * Primer día hábil que sirve la segunda tanda.
 *
 * El 203 fue el último del esquema viejo y su palabra fue ACTAS —tercera vuelta
 * completa más 37—. Los días anteriores se resuelven con el esquema viejo a
 * propósito: la palabra de un día que ya se jugó no puede cambiar
 * retroactivamente. De hecho ya pasó una vez en esta misma sesión: un recorrido
 * a saltos sobre la lista unificada movió la palabra del 203 de ACTAS a CALVO
 * **a mitad del día**, con gente que ya había jugado.
 */
const DIA_TANDA_2 = 204;

/**
 * La palabra del día.
 *
 * TRES TRAMOS, y el del medio es el punto de todo esto:
 *
 *  1. Antes del día 204, el esquema viejo tal cual, para no reescribir el pasado.
 *  2. Del 204 en adelante y por 46 días hábiles, **sólo palabras de la segunda
 *     tanda, cada una exactamente una vez**. Las 55 viejas ya se vieron tres o
 *     cuatro veces cada una, así que volver a servirlas ahora sería repetir algo
 *     que todo el mundo ya jugó. Son más de dos meses sin una sola repetición.
 *  3. Recién cuando la tanda se agota, vuelven las viejas, cíclicamente.
 *
 * Dentro de cada tramo se recorre a saltos y no en orden, porque en orden los
 * temas saldrían agrupados: doce días seguidos de palabras capilares, después
 * dieciséis de trámites. El paso coprimo garantiza que igual salgan todas una
 * vez, sólo que mezcladas.
 *
 * Lo que esto NO hace es esconder nada, y conviene dejarlo escrito igual que el
 * agujero de identidad del propio Pelardle: **el repositorio es público**, así
 * que las listas y esta función están a la vista y la palabra de cualquier día
 * es calculable por quien se tome el trabajo. Taparlo de verdad pediría sacar la
 * lista del repo, que es la misma mudanza que hicieron los secretos a
 * `~/pela-data/`. No se hizo porque la palabra del día no es una credencial.
 */
function wordFor(index) {
  const i = Number(index) || 1;
  if (i < DIA_TANDA_2) return VIEJAS[(i - 1) % VIEJAS.length];

  const desde = i - DIA_TANDA_2;
  if (desde < TANDA_2.length) {
    return TANDA_2[(desde * pasoPara(TANDA_2.length)) % TANDA_2.length];
  }

  const resto = desde - TANDA_2.length;
  return VIEJAS[(resto * pasoPara(VIEJAS.length)) % VIEJAS.length];
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
  const fecha = fechaArgentina();
  const { index, open } = await diaHabil(fecha);

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

    const fecha = fechaArgentina();
    const { index } = await diaHabil(fecha);
    const answer = wordFor(index);

    const result = scoreGuess(guess, answer);
    const solved = guess === answer;

    // Registrar intento contra el servicio multijugador (autoridad central anti-trampa)
    const playerId = body.playerId || "anon";
    const playerName = body.playerName || "Pelado Anónimo";

    // El número de intento SIEMPRE lo decide el servicio; el cliente no vota.
    // Queda en null si el servicio no contesta, y más abajo eso se trata como
    // "no puedo probar que agotó los intentos", que es el lado seguro: si
    // acá cayéramos al valor del cliente, un attempt:6 inventado revelaría
    // la palabra en el primer intento, que es justo lo que esto viene a evitar.
    let attempt = null;

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
      // Servicio caído: se sigue jugando, pero sin revelar la palabra por
      // agotamiento. El jugador pierde la pantalla de derrota, no la partida.
    }

    const exhausted = !solved && attempt !== null && attempt >= MAX_ATTEMPTS;

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
