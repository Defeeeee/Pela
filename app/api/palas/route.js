import { rutaPuzzleDiario } from "../../lib/puzzleDiario";

export const dynamic = "force-dynamic";

/**
 * ¿Cuántas palas? — el puzzle diario de estimación.
 *
 * El total de la escena NUNCA pasa por acá: lo guarda el servicio, que es el que
 * corrige. Lo que vuelve del envío es la distancia, y con eso quedan dos
 * candidatos, así que el texto de compartir no spoilea.
 */
const { GET, POST } = rutaPuzzleDiario({
  juego: "palas",
  recurso: "escena",
  envio: (cuerpo) => ({ intento: cuerpo?.intento }),
});

export { GET, POST };
