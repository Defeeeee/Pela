import fs from "node:fs";
import path from "node:path";

/**
 * Carga secretos a process.env desde un archivo de texto plano.
 *
 * Por qué existe esto en vez de usar .env de Next o env_file de PM2: el sitio
 * se despliega copiando el build standalone sobre /home/ubuntu/pela, así que
 * cualquier archivo dentro del paquete de deploy se sobrescribe en cada push.
 * El bloque env: de ecosystem.config.cjs además está commiteado en git, así
 * que tampoco sirve para credenciales. La única ubicación que sobrevive es un
 * directorio fuera del paquete, que es donde ya vive el leaderboard.
 *
 * Formato: CLAVE=valor por línea. Se ignoran vacías y las que empiezan con #.
 * No expande variables ni interpreta comillas a propósito: cuanto menos
 * magia, menos sorpresas con un secret que tenga caracteres raros.
 */

const DIR_POR_DEFECTO = path.join(process.cwd(), "..", "pela-data");

export function cargarSecretos(dir = process.env.PELA_DATA_DIR || DIR_POR_DEFECTO) {
  const archivo = path.join(dir, "secretos.env");

  if (!fs.existsSync(archivo)) {
    // No es un error: en desarrollo se puede correr sin credenciales y las
    // features que las necesiten se apagan solas (ver authDisponible()).
    return { cargado: false, archivo, claves: [] };
  }

  const claves = [];
  for (const linea of fs.readFileSync(archivo, "utf-8").split("\n")) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;

    const corte = limpia.indexOf("=");
    if (corte <= 0) continue;

    const clave = limpia.slice(0, corte).trim();
    const valor = limpia.slice(corte + 1).trim();

    // Lo que ya venga del entorno gana: permite pisar un valor puntual sin
    // editar el archivo, por ejemplo al probar algo a mano.
    if (process.env[clave] === undefined) process.env[clave] = valor;
    claves.push(clave);
  }

  return { cargado: true, archivo, claves };
}

/** El login sólo se ofrece si están las tres piezas que necesita. */
export function authDisponible() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.SESSION_SECRET
  );
}
