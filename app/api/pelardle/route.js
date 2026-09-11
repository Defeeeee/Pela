import { NextResponse } from "next/server";
import { diaHabil, fechaArgentina } from "../../lib/diaHabil";

export const dynamic = "force-dynamic";

const WORD_LENGTH = 5;
const MAX_ATTEMPTS = 6;

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
