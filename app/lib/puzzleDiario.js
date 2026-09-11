/**
 * El molde de las rutas de los puzzles diarios.
 *
 * Las tres —palas, bit golf y la pila— hacen exactamente lo mismo: resolver qué
 * día hábil es, pedirle al servicio el puzzle de ese día, y mandarle el único
 * envío del jugador. Cambian el nombre del juego, el del recurso y qué campos
 * lleva el envío; el resto es idéntico, incluida la parte que importa de verdad,
 * que es el manejo de errores.
 *
 * Vive acá y no copiado tres veces porque las decisiones que codifica son
 * decisiones de producto, y tienen que valer para los tres juegos:
 *
 *   - El servicio bindea a 127.0.0.1, así que ESTA ruta es el único camino. No
 *     hay forma de pegarle al servicio desde afuera.
 *   - Si el servicio no contesta, el RANKING falla en silencio y devuelve tablas
 *     vacías: es accesorio y el juego se juega igual. El PUZZLE, en cambio,
 *     devuelve 503 con un mensaje, porque sin puzzle no hay juego y hay que
 *     decirlo.
 *   - El índice del día sale de `diaHabil`, el mismo que usa Pelardle, así que
 *     todos los juegos coinciden siempre en qué día es.
 */

import { NextResponse } from "next/server";
import { diaHabil, fechaArgentina } from "./diaHabil";
import { urlDelServicio } from "./auth";

/**
 * Arma el par GET/POST de un puzzle diario.
 *
 * @param {string} juego    prefijo del servicio, por ejemplo "palas"
 * @param {string} recurso  el endpoint del puzzle: "escena", "hoyo", "secuencia".
 *                          NO puede llamarse "puzzle": esa clave ya la usa el
 *                          índice del día, y el recurso la pisaría. Bit golf se
 *                          llamó así primero y la página recibía el objeto donde
 *                          esperaba el número del día.
 * @param {function} envio  del cuerpo que manda el cliente saca lo que va al servicio
 */
export function rutaPuzzleDiario({ juego, recurso, envio }) {
  async function GET(request) {
    const { index, open } = await diaHabil(fechaArgentina());
    const url = new URL(request.url);

    if (url.searchParams.get("board") === "1") {
      try {
        const res = await fetch(`${urlDelServicio()}/${juego}/board?dia=${index}`, { cache: "no-store" });
        const datos = await res.json();
        return NextResponse.json({ ...datos, puzzle: index });
      } catch (e) {
        return NextResponse.json({ ok: false, puzzle: index, daily: [], history: [] });
      }
    }

    try {
      const res = await fetch(`${urlDelServicio()}/${juego}/${recurso}?dia=${index}`, { cache: "no-store" });
      if (!res.ok) throw new Error("servicio");
      const datos = await res.json();
      // La clave con la que viene el puzzle se conserva tal cual —`escena`,
      // `puzzle`, `secuencia`— para que cada página lea lo suyo por su nombre.
      return NextResponse.json({ ok: true, puzzle: index, open, [recurso]: datos[recurso] });
    } catch (e) {
      return NextResponse.json(
        { ok: false, puzzle: index, open, error: "El puzzle de hoy no está disponible. Probá en un rato." },
        { status: 503 }
      );
    }
  }

  async function POST(request) {
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
      const res = await fetch(`${urlDelServicio()}/${juego}/intento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dia: index,
          playerId,
          playerName: String(cuerpo?.playerName || "").slice(0, 16),
          ...envio(cuerpo),
        }),
      });
      const datos = await res.json();
      // `yaJugado` no es un error del pedido sino el estado normal de quien ya
      // entregó, así que va con 200 y la página lo muestra como resultado.
      return NextResponse.json(
        { ...datos, puzzle: index },
        { status: datos?.error && !datos.yaJugado ? 400 : 200 }
      );
    } catch (e) {
      return NextResponse.json({ error: "No se pudo registrar el intento." }, { status: 503 });
    }
  }

  return { GET, POST };
}
