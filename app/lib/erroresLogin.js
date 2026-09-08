/**
 * Mensajes de los errores de login.
 *
 * Vive aparte porque los muestran dos páginas distintas: /menu, que es a donde
 * vuelve el callback, y /closed, que es a donde rebota /menu fuera del horario
 * laboral. Sin esto último el error se perdía: el usuario entraba con Google,
 * fallaba algo, y sólo veía el cartel de "hoy no laburo" sin saber por qué.
 */
const MENSAJES = {
  "sin-configurar": "El login todavía no está configurado en el servidor.",
  cancelado: "Cancelaste el ingreso con Google.",
  "faltan-datos": "Faltaron datos en la vuelta desde Google. Probá de nuevo.",
  "estado-invalido": "El pedido de ingreso venció o no era válido. Probá de nuevo.",
  "token-rechazado": "Google rechazó el ingreso. Probá de nuevo.",
  "perfil-rechazado": "Google no dejó leer tu perfil.",
  "perfil-incompleto": "Google no devolvió una cuenta usable.",
  "google-no-responde": "Google no respondió a tiempo. Probá de nuevo.",
  "servicio-no-responde": "No se pudo guardar tu cuenta. Probá en un rato.",
};

export function mensajeDeLoginError(codigo) {
  if (!codigo) return null;
  return MENSAJES[codigo] || "No se pudo entrar con Google.";
}
