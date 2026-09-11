import { rutaPuzzleDiario } from "../../lib/puzzleDiario";

export const dynamic = "force-dynamic";

/**
 * La pila de palas — seguir el puntero por una secuencia de PUSH y POP.
 *
 * La secuencia es pública y se simula a mano, que es el juego. Lo único que se
 * queda del lado del servicio son las cuatro respuestas: si volvieran acá, el
 * segundo jugador las copia del primero.
 */
const { GET, POST } = rutaPuzzleDiario({
  juego: "pila",
  recurso: "secuencia",
  envio: (cuerpo) => ({ respuesta: cuerpo?.respuesta }),
});

export { GET, POST };
