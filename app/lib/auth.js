import { cargarSecretos, authDisponible as hayCredenciales } from "../../secretos.js";

// Los secretos se cargan una vez por proceso, al primer import. El server
// standalone de Next no lee ningún .env por su cuenta (se verificó leyendo el
// server.js que genera), así que sin esto process.env llegaría vacío.
let cargados = false;
function asegurarSecretos() {
  if (cargados) return;
  cargados = true;
  try {
    cargarSecretos();
  } catch (e) {
    console.error("[auth] No se pudieron cargar los secretos:", e.message);
  }
}

export function authDisponible() {
  asegurarSecretos();
  return hayCredenciales();
}

/**
 * URL pública de la app, para armar el redirect_uri que Google tiene que ver
 * idéntico al registrado en la consola.
 *
 * Se prefiere APP_URL explícito porque detrás de Traefik el origen que ve Next
 * puede venir en http aunque el usuario haya entrado por https, y un
 * redirect_uri que no coincida exactamente hace fallar el login entero.
 */
export function urlDeLaApp(request) {
  asegurarSecretos();
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");

  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || url.host;
  return `${proto}://${host}`;
}

/** Base del servicio que guarda identidades y leaderboard (proceso aparte). */
export function urlDelServicio() {
  asegurarSecretos();
  return process.env.MP_URL || "http://127.0.0.1:9315";
}
