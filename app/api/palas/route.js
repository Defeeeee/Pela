import { NextResponse } from "next/server";
import { diaHabil, fechaArgentina } from "../../lib/diaHabil";
import { urlDelServicio } from "../../lib/auth";

export const dynamic = "force-dynamic";

/**
 * ¿Cuántas palas? — el puzzle diario de estimación.
 *
 * Esta ruta es el único camino al servicio: el servidor de multijugador bindea a
 * 127.0.0.1 y no está expuesto a la red. Y el total de la escena NUNCA pasa por
 * acá hasta que el jugador ya envió su intento, porque es la respuesta.
 *
 * El índice del día sale de `diaHabil`, el mismo que usa Pelardle, así que los
 * dos juegos coinciden siempre en qué día es.
 */

/** GET: la escena del día sin el total, o el ranking con `?board=1`. */
export async function GET(request) {
  const { index, open } = await diaHabil(fechaArgentina());

  const url = new URL(request.url);
  if (url.searchParams.get("board") === "1") {
    try {
      const res = await fetch(`${urlDelServicio()}/palas/board?dia=${index}`, { cache: "no-store" });
      const datos = await res.json();
      return NextResponse.json({ ...datos, puzzle: index });
    } catch (e) {
      // El ranking es accesorio: si el servicio no contesta, el juego se juega
      // igual y la tabla aparece vacía.
      return NextResponse.json({ ok: false, puzzle: index, daily: [], history: [] });
    }
  }

  try {
    const res = await fetch(`${urlDelServicio()}/palas/escena?dia=${index}`, { cache: "no-store" });
    if (!res.ok) throw new Error("servicio");
    const datos = await res.json();
    return NextResponse.json({ ok: true, puzzle: index, open, escena: datos.escena });
  } catch (e) {
    return NextResponse.json(
      { ok: false, puzzle: index, open, error: "El puzzle de hoy no está disponible. Probá en un rato." },
      { status: 503 }
    );
  }
}

/** POST: el único intento del día. */
export async function POST(request) {
  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch (e) {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  const { index } = await diaHabil(fechaArgentina());
  const playerId = String(cuerpo?.playerId || "").trim();
  if (!playerId) return NextResponse.json({ error: "Falta el jugador." }, { status: 400 });

  try {
    const res = await fetch(`${urlDelServicio()}/palas/intento`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dia: index,
        playerId,
        playerName: String(cuerpo?.playerName || "").slice(0, 16),
        intento: cuerpo?.intento,
      }),
    });
    const datos = await res.json();
    return NextResponse.json(
      { ...datos, puzzle: index },
      { status: datos?.error && !datos.yaJugado ? 400 : 200 }
    );
  } catch (e) {
    return NextResponse.json({ error: "No se pudo registrar el intento." }, { status: 503 });
  }
}
