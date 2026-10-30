/**
 * Verificación diferencial de `fork.js` contra el SISTEMA OPERATIVO de verdad.
 *
 * El simulador de `fork.js` es mi idea de lo que hace `fork()`. Ningún test
 * escrito por mí puede agarrar el bug de haberlo entendido mal, porque el test
 * tendría el mismo error. Así que esto compila los programas generados, los
 * corre, reconstruye el árbol de procesos real y exige que coincida en las
 * cuatro respuestas.
 *
 *     node multiplayer-server/verificar-fork.js 60
 *
 * NO ES PARTE DE LA SUITE, por una razón distinta a la de `verificar-cpu.js`:
 * aquello necesitaba un toolchain x86-64 que el VPS ARM no tiene; esto necesita
 * **crear cientos de procesos de verdad**, y un test que forkea 24 procesos por
 * día durante 60 días no tiene nada que hacer corriendo en el servidor de
 * producción junto al multijugador. Se corre a mano al tocar el simulador.
 *
 * CÓMO SE RECONSTRUYE EL ÁRBOL, que es la parte con trampa. `fork()` se
 * reemplaza por una función que hace exactamente lo mismo más anunciar el
 * nacimiento, y el padre **captura su propio pid ANTES de bifurcar** para
 * pasárselo al hijo por la copia de memoria. Preguntar `getppid()` desde el hijo
 * no sirve: si el padre ya salió —y estos programas tienen `exit()` a propósito—
 * el hijo queda reparentado a init y devuelve 1. Se vio pasar en la primera
 * prueba: un proceso reportó padre 23943 al nacer y padre 1 tres líneas después.
 */

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { programaDelDia, simular } from "./fork.js";

const DIAS = Number(process.argv[2]) || 40;
const dir = mkdtempSync(join(tmpdir(), "pela-fork-"));

/** El mismo listado del puzzle, pero con el fork instrumentado. */
function instrumentar(lineas) {
  const salida = [];
  for (const l of lineas) {
    if (l === "int main(void) {") {
      salida.push(
        "static pid_t F(void) {",
        "    pid_t yo = getpid();",
        "    pid_t r = fork();",
        "    if (r == 0) printf(\"N %d %d\\n\", getpid(), yo);",
        "    return r;",
        "}",
        "int main(void) {",
      );
      continue;
    }
    // `fork()` pasa a `F()`: misma semántica más una observación.
    salida.push(l.replace(/\bfork\(\)/g, "F()"));
  }
  // El original se anuncia solo, que si no no entra en la cuenta.
  const i = salida.findIndex((x) => x.includes("setvbuf"));
  salida.splice(i + 1, 0, "    printf(\"R %d\\n\", getpid());");
  return salida;
}

let fallos = 0;
for (let dia = 1; dia <= DIAS; dia++) {
  const p = programaDelDia(dia);
  const esperado = simular(p.programa);

  const fuente = join(dir, `d${dia}.c`);
  const bin = join(dir, `d${dia}`);
  writeFileSync(fuente, instrumentar(p.lineas).join("\n") + "\n");

  try {
    execFileSync("clang", ["-o", bin, fuente], { stdio: "pipe" });
  } catch (e) {
    console.error(`✗ día ${dia}: no compila\n${String(e.stderr || e.message).slice(0, 400)}`);
    fallos++;
    continue;
  }

  const salida = execFileSync(bin, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });

  // Reconstrucción del árbol real a partir de lo que imprimió el kernel.
  let raiz = null;
  const padre = new Map();
  const etiquetas = new Map();
  for (const linea of salida.split("\n")) {
    const t = linea.trim().split(/\s+/);
    if (t[0] === "R") raiz = Number(t[1]);
    else if (t[0] === "N") padre.set(Number(t[1]), Number(t[2]));
    else if (t[0]) etiquetas.set(t[0], (etiquetas.get(t[0]) || 0) + 1);
  }

  const prof = (x) => { let d = 0; while (padre.has(x)) { x = padre.get(x); d++; } return d; };
  const real = {
    total: 1 + padre.size,
    hijosDirectos: [...padre.values()].filter((x) => x === raiz).length,
    profundidad: Math.max(0, ...[...padre.keys()].map(prof)),
    etiqueta: etiquetas.get(p.etiqueta) || 0,
  };
  const mio = {
    total: esperado.total,
    hijosDirectos: esperado.hijosDirectos,
    profundidad: esperado.profundidad,
    etiqueta: esperado.etiquetas[p.etiqueta] || 0,
  };

  for (const k of ["total", "hijosDirectos", "profundidad", "etiqueta"]) {
    if (real[k] !== mio[k]) {
      console.error(`✗ día ${dia}, ${k}: el simulador dice ${mio[k]} y el kernel dice ${real[k]}`);
      fallos++;
    }
  }
}

if (fallos > 0) {
  console.error(`\n${fallos} discrepancias en ${DIAS} días. El simulador NO representa a fork().`);
  process.exit(1);
}
console.log(`✓ ${DIAS} días compilados, corridos y verificados: el simulador coincide con el kernel en las cuatro respuestas.`);
