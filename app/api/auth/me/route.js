import { NextResponse } from "next/server";
import { COOKIE_SESION, leerSesion, opcionesCookie } from "../../../lib/sesion";
import { authDisponible } from "../../../lib/auth";

export const dynamic = "force-dynamic";

/**
 * Quién soy. La usa el cliente para saber si mostrar "Entrar" o tu apodo, y
 * también el servidor de sockets: en vez de compartir la criptografía de la
 * sesión entre dos procesos, el de sockets le pasa el token a esta ruta por
 * localhost y le cree la respuesta. Un solo lugar sabe validar sesiones.
 */
export async function GET(request) {
  const disponible = authDisponible();

  // El token puede venir en la cookie (navegador) o en el header
  // (servidor de sockets validando un handshake).
  const desdeHeader = request.headers.get("x-pela-sesion");
  const token = desdeHeader || request.cookies.get(COOKIE_SESION)?.value;
  const sesion = leerSesion(token);

  const res = NextResponse.json({
    loginDisponible: disponible,
    autenticado: Boolean(sesion),
    playerId: sesion?.pid || null,
    nombre: sesion?.nombre || null,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/** Cerrar sesión: se borra la cookie. */
export async function POST(request) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_SESION, "", { ...opcionesCookie(0), maxAge: 0 });
  return res;
}
