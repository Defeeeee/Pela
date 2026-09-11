import { Room, CORRAL_X, CORRAL_Y, CORRAL_W, CORRAL_H } from "../multiplayer-server/rooms.js";
import { codificar, TAM_OBS } from "../multiplayer-server/observacion-escape.js";

/**
 * Arma escenas sintéticas y emite sus observaciones, para poder preguntarle a
 * la red qué hace en cada una.
 *
 * Las escenas se construyen con la MISMA `codificar()` que usa el entrenamiento
 * y producción. Reimplementarla del lado de Python sería la forma más rápida de
 * terminar sondeando una observación distinta de la que la red realmente ve, y
 * de sacar conclusiones sobre un modelo que no existe.
 *
 * Emite JSON por stdout: { escenas: [...], obs: [[...], ...] }
 */

const CX = CORRAL_X + CORRAL_W / 2;
const CY = CORRAL_Y + CORRAL_H / 2;

function sala(modo = "coop") {
  const r = new Room("SONDA", { isPublic: false, mode: modo, random: () => 0.5 });
  r.addPlayer("yo", "Yo");
  r.beginPlaying();
  r.enemies = [];
  r.warnings = [];
  const p = r.players.get("yo");
  p.x = CX;
  p.y = CY;
  return { r, p };
}

/** Coloca un enemigo en curso de colisión desde el ángulo `ang` a distancia `d`. */
function enemigoQueChoca(p, ang, d, vel = 5, size = 30) {
  const x = p.x + Math.cos(ang) * d;
  const y = p.y + Math.sin(ang) * d;
  // Velocidad apuntando exactamente al jugador: colisión garantizada.
  return { x, y, vx: -Math.cos(ang) * vel, vy: -Math.sin(ang) * vel, size };
}

const escenas = [];
const obs = [];
const buf = new Float32Array(TAM_OBS);

function agregar(meta, room) {
  codificar(room, "yo", buf, 0);
  escenas.push(meta);
  obs.push(Array.from(buf));
}

// ── Sonda 1: respuesta a una amenaza, por ángulo y distancia ───────────────
// Es el mapa de esquive. Dice si aprendió a salir perpendicular (lo eficiente)
// o a huir de frente (lo intuitivo y peor).
for (const d of [150, 250, 400]) {
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    const { r, p } = sala();
    r.enemies = [enemigoQueChoca(p, ang, d)];
    agregar({ sonda: "esquive", anguloIdx: i, angulo: ang, distancia: d }, r);
  }
}

// ── Sonda 2: umbral de reacción ───────────────────────────────────────────
// Un enemigo de frente cada vez más cerca. Muestra a cuántos ticks del impacto
// decide moverse, que es el parámetro que un jugador humano también tiene.
for (const ticks of [4, 8, 12, 16, 20, 25, 30, 40, 50, 65, 80, 100, 120]) {
  const { r, p } = sala();
  const vel = 5;
  r.enemies = [enemigoQueChoca(p, Math.PI, ticks * vel, vel)];
  agregar({ sonda: "umbral", ticksAlImpacto: ticks }, r);
}

// ── Sonda 3: mapa de valor con el corral vacío ────────────────────────────
// Sin ningún enemigo, ¿qué posiciones considera seguras? Es el test directo de
// la hipótesis de la pared: si valora el borde, se va a ver como un marco
// brillante alrededor del corral.
const NX = 33, NY = 19;
for (let iy = 0; iy < NY; iy++) {
  for (let ix = 0; ix < NX; ix++) {
    const { r, p } = sala();
    p.x = CORRAL_X + p.size / 2 + (ix / (NX - 1)) * (CORRAL_W - p.size);
    p.y = CORRAL_Y + p.size / 2 + (iy / (NY - 1)) * (CORRAL_H - p.size);
    agregar({ sonda: "valor", ix, iy, x: p.x, y: p.y }, r);
  }
}

// ── Sonda 4: la misma amenaza, contra la pared y en el centro ─────────────
// Si el comportamiento no cambia entre las dos, entonces no aprendió que la
// pared le quita salidas: estaría en el borde por otra razón.
const LUGARES = {
  centro: [CX, CY],
  izquierda: [CORRAL_X + 30, CY],
  derecha: [CORRAL_X + CORRAL_W - 30, CY],
  arriba: [CX, CORRAL_Y + 30],
  abajo: [CX, CORRAL_Y + CORRAL_H - 30],
  esquina: [CORRAL_X + 30, CORRAL_Y + 30],
};
for (const [lugar, [px, py]] of Object.entries(LUGARES)) {
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    const { r, p } = sala();
    p.x = px; p.y = py;
    r.enemies = [enemigoQueChoca(p, ang, 220)];
    agregar({ sonda: "lugar", lugar, anguloIdx: i, angulo: ang }, r);
  }
  // Y sin amenaza, para tener el valor del lugar en reposo.
  const { r, p } = sala();
  p.x = px; p.y = py;
  agregar({ sonda: "lugarReposo", lugar }, r);
}

// ── Sonda 5: ¿usa los avisos? ─────────────────────────────────────────────
// Un aviso todavía no es un enemigo: no puede chocarte. Si se mueve igual, es
// porque aprendió a anticiparse, que es información que sólo está en esos
// canales. Es la pregunta que más me interesa y no sé la respuesta.
for (const falta of [200, 500, 900, 1300]) {
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const { r, p } = sala();
    const d = 320;
    r.warnings = [{
      x: p.x + Math.cos(ang) * d, y: p.y + Math.sin(ang) * d,
      vx: -Math.cos(ang) * 5, vy: -Math.sin(ang) * 5,
      spawnAt: r.tiempo + falta, size: 80,
    }];
    agregar({ sonda: "aviso", anguloIdx: i, angulo: ang, faltaMs: falta }, r);
  }
}

// ── Sonda 6: dificultad ──────────────────────────────────────────────────
// El mismo escenario en distintos minutos de partida. El canal de tiempo
// existe para que sepa que a los tres minutos hace falta más margen.
for (const min of [0, 0.5, 1, 2, 3, 5]) {
  const { r, p } = sala();
  r.tiempo = min * 60000;
  r.enemies = [enemigoQueChoca(p, Math.PI, 250)];
  agregar({ sonda: "minuto", minuto: min }, r);
}

process.stdout.write(JSON.stringify({ tamObs: TAM_OBS, escenas, obs }));
