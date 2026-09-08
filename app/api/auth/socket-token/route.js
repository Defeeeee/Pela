import { NextResponse } from "next/server";
import { COOKIE_SESION, leerSesion, crearTicketSocket } from "../../../lib/sesion";

export const dynamic = "force-dynamic";

/**
 * Entrega un ticket de vida corta para abrir un socket.
 *
 * El cliente no puede leer la cookie de sesión (es HttpOnly), así que pide
 * este ticket justo antes de conectarse y lo manda en el handshake. El
 * servidor de sockets lo valida contra /api/auth/me como cualquier sesión.
 */
export async function GET(request) {
  const sesion = leerSesion(request.cookies.get(COOKIE_SESION)?.value);

  if (!sesion) {
    const res = NextResponse.json({ error: "Necesitás entrar con Google." }, { status: 401 });
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  const res = NextResponse.json({
    ticket: crearTicketSocket({ playerId: sesion.pid, nombre: sesion.nombre }),
    playerId: sesion.pid,
    nombre: sesion.nombre,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
