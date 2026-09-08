import { NextResponse } from "next/server";
import { COOKIE_ESTADO, COOKIE_SESION, crearSesion, opcionesCookie } from "../../../../lib/sesion";
import { authDisponible, urlDeLaApp, urlDelServicio } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

function volverConError(base, motivo) {
  return NextResponse.redirect(`${base}/menu?loginError=${encodeURIComponent(motivo)}`);
}

/**
 * Vuelta desde Google. Acá se cambia el código por un token, se averigua quién
 * es la persona, y se le ata su identidad de jugador.
 */
export async function GET(request) {
  const base = urlDeLaApp(request);

  if (!authDisponible()) return volverConError(base, "sin-configurar");

  const params = new URL(request.url).searchParams;

  // Google avisa acá si el usuario canceló en la pantalla de consentimiento.
  if (params.get("error")) return volverConError(base, "cancelado");

  const codigo = params.get("code");
  const estadoRecibido = params.get("state");
  const cookieEstado = request.cookies.get(COOKIE_ESTADO)?.value;

  if (!codigo || !estadoRecibido || !cookieEstado) return volverConError(base, "faltan-datos");

  const [estadoGuardado, destinoGuardado, pidAnonimo] = cookieEstado.split("|");
  // Defensa CSRF: el estado que vuelve tiene que ser el que emitimos nosotros.
  if (estadoGuardado !== estadoRecibido) return volverConError(base, "estado-invalido");

  let perfil;
  try {
    // 1. Cambiar el código por un token. Acá se usa el client secret, del lado
    //    del servidor: nunca viaja al navegador.
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: codigo,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${base}/api/auth/callback/google`,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!tokenRes.ok) return volverConError(base, "token-rechazado");
    const tokens = await tokenRes.json();

    // 2. Pedirle el perfil a Google con ese token. Se usa el endpoint de
    //    userinfo en vez de decodificar el id_token para no tener que validar
    //    firmas JWT a mano: el dato viene de Google por TLS y ya está.
    const perfilRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!perfilRes.ok) return volverConError(base, "perfil-rechazado");
    perfil = await perfilRes.json();
  } catch (e) {
    return volverConError(base, "google-no-responde");
  }

  if (!perfil?.sub) return volverConError(base, "perfil-incompleto");

  // 3. Atar la identidad. Si el navegador ya venía jugando como anónimo, se
  //    manda ese playerId para que la cuenta se quede con esa historia en vez
  //    de arrancar de cero: es la migración de rachas.
  const anonimo = pidAnonimo || null;

  let identidad;
  try {
    const res = await fetch(`${urlDelServicio()}/cuentas/vincular`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        googleSub: perfil.sub,
        email: perfil.email || null,
        nombreGoogle: perfil.name || null,
        playerIdAnonimo: anonimo,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return volverConError(base, "servicio-no-responde");
    identidad = await res.json();
  } catch (e) {
    return volverConError(base, "servicio-no-responde");
  }

  const destino = destinoGuardado?.startsWith("/") ? destinoGuardado : "/menu";
  const res = NextResponse.redirect(`${base}${destino}`);
  res.cookies.set(
    COOKIE_SESION,
    crearSesion({
      playerId: identidad.playerId,
      googleSub: perfil.sub,
      // Sin apodo reservado la sesión queda sin nombre a propósito: la UI lo
      // detecta y hace elegir uno antes de dejar entrar al ranking o al multi.
      nombre: identidad.apodo || null,
    }),
    opcionesCookie()
  );
  res.cookies.set(COOKIE_ESTADO, "", { ...opcionesCookie(0), maxAge: 0 });
  return res;
}
