import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { COOKIE_ESTADO, opcionesCookie } from "../../../lib/sesion";
import { authDisponible, urlDeLaApp } from "../../../lib/auth";

export const dynamic = "force-dynamic";

/**
 * Arranca el login: manda al usuario a Google.
 *
 * El parámetro `state` es la defensa contra CSRF: se genera al azar, se guarda
 * en una cookie de vida corta y se compara al volver. Sin eso, un tercero
 * podría inducirte a completar un login con SU código y quedar logueado como
 * él en tu navegador.
 */
export async function GET(request) {
  if (!authDisponible()) {
    return NextResponse.json(
      { error: "El login todavía no está configurado en este servidor." },
      { status: 503 }
    );
  }

  const estado = crypto.randomBytes(32).toString("base64url");

  // A dónde volver después de loguearse. Sólo se aceptan rutas internas: un
  // destino absoluto permitiría usar el login como redirector hacia afuera.
  const destinoCrudo = new URL(request.url).searchParams.get("volverA") || "/menu";
  const destino = destinoCrudo.startsWith("/") && !destinoCrudo.startsWith("//") ? destinoCrudo : "/menu";

  // El id anónimo vive en localStorage, no en una cookie, así que el cliente
  // lo manda como parámetro al iniciar el login. Viaja en la cookie de estado
  // hasta la vuelta: es lo que permite que la cuenta adopte la historia que ya
  // tenías jugando sin cuenta, en vez de arrancar de cero.
  const pidCrudo = new URL(request.url).searchParams.get("pid") || "";
  const pid = /^[A-Za-z0-9_-]{1,64}$/.test(pidCrudo) ? pidCrudo : "";

  const base = urlDeLaApp(request);
  const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  google.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID);
  google.searchParams.set("redirect_uri", `${base}/api/auth/callback/google`);
  google.searchParams.set("response_type", "code");
  google.searchParams.set("scope", "openid email profile");
  google.searchParams.set("state", estado);
  google.searchParams.set("prompt", "select_account");

  const res = NextResponse.redirect(google.toString());
  // El estado y el destino viajan juntos en la cookie, así no hace falta
  // ningún almacén compartido entre los workers del cluster.
  res.cookies.set(
    COOKIE_ESTADO,
    `${estado}|${destino}|${pid}`,
    opcionesCookie(10 * 60 * 1000) // diez minutos para completar el login
  );
  return res;
}
