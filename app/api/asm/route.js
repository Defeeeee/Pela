import { rutaPuzzleDiario } from "../../lib/puzzleDiario";

export const dynamic = "force-dynamic";

/**
 * ¿Qué devuelve? — leer x86-64 y decir qué computa.
 *
 * El código y las cuatro entradas son públicos: el juego es trazarlos. Lo único
 * que se queda del lado del servicio son los cuatro resultados, porque si
 * volvieran acá el segundo jugador los copia del primero.
 */
const { GET, POST } = rutaPuzzleDiario({
  juego: "asm",
  recurso: "funcion",
  envio: (cuerpo) => ({ respuestas: cuerpo?.respuestas }),
});

export { GET, POST };
