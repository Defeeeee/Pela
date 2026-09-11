import { rutaPuzzleDiario } from "../../lib/puzzleDiario";

export const dynamic = "force-dynamic";

/**
 * Bit Golf — llegar de un byte a otro en los menos golpes.
 *
 * Acá no hay nada que esconder, al revés que en los otros dos: el byte inicial,
 * el objetivo, las operaciones y hasta el par viajan al cliente. El par se
 * MUESTRA a propósito —es un juego de golf— y se puede calcular igual con un
 * BFS de 256 estados. Lo que se mide es en cuántos golpes llegaste.
 */
const { GET, POST } = rutaPuzzleDiario({
  juego: "bitgolf",
  recurso: "hoyo",
  envio: (cuerpo) => ({ jugadas: cuerpo?.jugadas }),
});

export { GET, POST };
