import crypto from "node:crypto";
import { cargarSecretos } from "../../secretos.js";

/**
 * Sesión sin estado, en una cookie firmada.
 *
 * Tiene que ser sin estado porque el sitio corre en PM2 cluster con 4 workers
 * y no hay ningún almacén compartido entre ellos: una sesión en memoria daría
 * respuestas distintas según qué worker atienda el request. La cookie lleva el
 * contenido y una firma HMAC; cualquier worker la valida con el mismo secreto.
 *
 * Se firma con node:crypto en vez de sumar una librería de auth: el proyecto
 * no tiene dependencias más allá de Next, React y sharp, y el servidor de
 * sockets (otro proceso) también necesita poder validar la sesión.
 */

export const COOKIE_SESION = "pela_sesion";
export const COOKIE_ESTADO = "pela_oauth_estado";

const DURACION_MS = 1000 * 60 * 60 * 24 * 365; // un año: es un sitio de chistes, no un banco

// El server standalone de Next no lee ningún .env por su cuenta, así que el
// secreto hay que cargarlo a mano. Se hace acá y no sólo en lib/auth.js porque
// hay rutas que validan sesiones sin pasar nunca por ese módulo (por ejemplo
// /api/auth/socket-token y la página /closed): sin esto, en producción esas
// rutas verían process.env vacío y darían por inválida cualquier sesión buena.
let secretosCargados = false;
function asegurarSecretos() {
  if (secretosCargados) return;
  secretosCargados = true;
  try {
    cargarSecretos();
  } catch (e) {
    console.error("[sesion] No se pudieron cargar los secretos:", e.message);
  }
}

function secreto() {
  asegurarSecretos();
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("Falta SESSION_SECRET");
  return s;
}

function firmar(datos) {
  return crypto.createHmac("sha256", secreto()).update(datos).digest("base64url");
}

/** Compara en tiempo constante para no filtrar información por timing. */
function firmasIguales(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function crearSesion({ playerId, googleSub, nombre }) {
  const payload = {
    pid: playerId,
    sub: googleSub,
    nombre,
    exp: Date.now() + DURACION_MS,
  };
  const cuerpo = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${cuerpo}.${firmar(cuerpo)}`;
}

/**
 * Ticket de vida corta para abrir un socket.
 *
 * La cookie de sesión es HttpOnly a propósito: el JavaScript de la página no
 * la puede leer, que es lo que la protege de un XSS. Pero el cliente necesita
 * *algo* que mandarle al servidor de sockets en el handshake. En vez de
 * exponer la sesión entera, se emite este ticket que vence en dos minutos:
 * alcanza para conectarse y no sirve para nada más si se filtra.
 */
export function crearTicketSocket({ playerId, nombre }) {
  const payload = { pid: playerId, nombre, exp: Date.now() + 2 * 60 * 1000 };
  const cuerpo = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${cuerpo}.${firmar(cuerpo)}`;
}

/** Devuelve el payload si el token es válido y no venció; null si no. */
export function leerSesion(token) {
  if (!token || typeof token !== "string") return null;

  const corte = token.lastIndexOf(".");
  if (corte <= 0) return null;

  const cuerpo = token.slice(0, corte);
  const firma = token.slice(corte + 1);

  let esperada;
  try {
    esperada = firmar(cuerpo);
  } catch (e) {
    return null; // sin SESSION_SECRET no hay sesión posible
  }
  if (!firmasIguales(firma, esperada)) return null;

  try {
    const payload = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf-8"));
    if (!payload?.pid || !payload?.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

/**
 * Atributos de la cookie. Secure sólo fuera de desarrollo porque en local se
 * sirve por http y el navegador descartaría una cookie Secure.
 * SameSite=Lax deja que la cookie viaje en la vuelta desde Google, que es una
 * navegación de nivel superior, pero no en peticiones de terceros.
 */
export function opcionesCookie(maxAgeMs = DURACION_MS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(maxAgeMs / 1000),
  };
}
