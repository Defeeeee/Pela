/**
 * Verificación diferencial de `asm.js` contra un x86-64 DE VERDAD.
 *
 * El evaluador de `asm.js` es mi idea de lo que hace cada instrucción. Esto
 * compara esa idea contra el procesador: genera las funciones de N días, las
 * ensambla con clang, las corre con sus entradas y exige que coincidan.
 *
 * NO ES PARTE DE LA SUITE, y la razón es concreta: hace falta un toolchain x86-64.
 * El servidor de producción es ARM y el Mac de desarrollo también, así que esto
 * anda sólo donde haya Rosetta o un Intel. Meterlo en `test-asm.js` haría fallar
 * los tests en las dos máquinas donde el proyecto corre de verdad.
 *
 * Se corre a mano cuando se toca el repertorio de instrucciones:
 *
 *     node multiplayer-server/verificar-cpu.js 200
 *
 * Es la única forma de descartar la clase de bug más peligrosa que tiene este
 * juego: que yo haya entendido mal una instrucción. Un error así no lo agarra
 * ningún test escrito por mí, porque el test tendría el mismo error.
 */

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { funcionDelDia, evaluar } from "./asm.js";

const DIAS = Number(process.argv[2]) || 100;
const dir = mkdtempSync(join(tmpdir(), "pela-asm-"));

// Se juntan TODAS las funciones en un solo archivo y se compila una vez: con un
// compilado por día, verificar doscientos días tardaba minutos.
const asm = ["        .text"];
const decls = [];
const llamadas = [];
const esperado = [];

for (let dia = 1; dia <= DIAS; dia++) {
  const f = funcionDelDia(dia);
  const nombre = `_pela${dia}`;
  asm.push(`        .globl  ${nombre}`);
  // La primera línea impresa es la etiqueta `pela:`, que acá se reemplaza por
  // una por día; el resto del cuerpo va tal cual, que es el punto del test.
  asm.push(`${nombre}:`);
  for (const linea of f.lineas.slice(1)) {
    // Las etiquetas locales también tienen que ser únicas entre funciones.
    asm.push(linea.replace(/\.otro/g, `.otro${dia}`));
  }
  decls.push(`int pela${dia}(int);`);
  for (const e of f.entradas) {
    llamadas.push(`  printf("%d\\n", pela${dia}(${e}));`);
    esperado.push({ dia, entrada: e, js: evaluar(f.fn, e) });
  }
}

writeFileSync(join(dir, "fns.s"), asm.join("\n") + "\n");
writeFileSync(join(dir, "main.c"),
  `#include <stdio.h>\n${decls.join("\n")}\nint main(){\n${llamadas.join("\n")}\n  return 0;\n}\n`);

try {
  execFileSync("clang", ["-arch", "x86_64", "-masm=intel", "-o", join(dir, "bin"),
    join(dir, "main.c"), join(dir, "fns.s")], { stdio: "pipe" });
} catch (e) {
  console.error("No se pudo compilar para x86-64 en esta máquina.");
  console.error("Hace falta clang con soporte x86-64 (un Intel, o Rosetta en Apple Silicon).");
  console.error(String(e.stderr || e.message).split("\n").slice(0, 5).join("\n"));
  process.exit(2);
}

const salida = execFileSync(join(dir, "bin"), { encoding: "utf8" }).trim().split("\n").map(Number);

let mal = 0;
for (let i = 0; i < esperado.length; i++) {
  const { dia, entrada, js } = esperado[i];
  if (salida[i] !== js) {
    mal++;
    console.error(`✗ día ${dia}, pela(${entrada}): el evaluador dice ${js} y la CPU dice ${salida[i]}`);
  }
}

if (mal > 0) {
  console.error(`\n${mal} de ${esperado.length} no coinciden. El evaluador NO representa a x86-64.`);
  process.exit(1);
}
console.log(`✓ ${esperado.length} evaluaciones sobre ${DIAS} días coinciden exactamente con un x86-64 real.`);
