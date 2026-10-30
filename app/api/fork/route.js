import { rutaPuzzleDiario } from "../../lib/puzzleDiario";

export const dynamic = "force-dynamic";

/**
 * El árbol de pelados — contar los procesos que crea un programa con fork().
 *
 * El listado es público: el juego es trazarlo. Lo único que se queda del lado
 * del servicio son las cuatro respuestas, porque si volvieran acá el segundo
 * jugador las copia del primero.
 */
const { GET, POST } = rutaPuzzleDiario({
  juego: "fork",
  recurso: "programa",
  envio: (cuerpo) => ({ respuesta: cuerpo?.respuesta }),
});

export { GET, POST };
