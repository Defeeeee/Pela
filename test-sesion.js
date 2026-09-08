/**
 * Tests de la sesión firmada.
 *
 * Se corre con `node test-sesion.js` desde la raíz. No usa el runner de Next
 * porque el módulo es Node puro: sólo node:crypto.
 *
 * Lo que se defiende acá es que nadie pueda fabricarse una sesión: la cookie
 * viaja por el navegador del usuario, así que su contenido es tan confiable
 * como su firma.
 */
import assert from "node:assert/strict";

process.env.SESSION_SECRET = "secreto-de-prueba-que-no-es-el-de-produccion";

const { crearSesion, crearTicketSocket, leerSesion, opcionesCookie } = await import("./app/lib/sesion.js");

console.log("Iniciando tests de sesión...");

// Ida y vuelta
{
  const token = crearSesion({ playerId: "p1", googleSub: "sub1", nombre: "Pelado" });
  const leida = leerSesion(token);
  assert.strictEqual(leida.pid, "p1");
  assert.strictEqual(leida.sub, "sub1");
  assert.strictEqual(leida.nombre, "Pelado");
  assert.ok(leida.exp > Date.now(), "Debe venir con vencimiento futuro");
  console.log("  ✓ Una sesión recién creada se lee de vuelta entera");
}

// Contenido manipulado
{
  const token = crearSesion({ playerId: "p1", googleSub: "sub1", nombre: "Pelado" });
  const [cuerpo, firma] = [token.slice(0, token.lastIndexOf(".")), token.slice(token.lastIndexOf(".") + 1)];

  // Cambiarse el playerId por el de otro, dejando la firma original
  const payload = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf-8"));
  payload.pid = "victima";
  const cuerpoFalso = Buffer.from(JSON.stringify(payload)).toString("base64url");

  assert.strictEqual(leerSesion(`${cuerpoFalso}.${firma}`), null, "Payload cambiado debe rechazarse");
  console.log("  ✓ Cambiar el contenido invalida la firma");
}

// Firma inventada
{
  const token = crearSesion({ playerId: "p1", googleSub: "sub1", nombre: "Pelado" });
  const cuerpo = token.slice(0, token.lastIndexOf("."));
  assert.strictEqual(leerSesion(`${cuerpo}.firmainventada`), null, "Firma inventada debe rechazarse");
  console.log("  ✓ Una firma inventada no pasa");
}

// Firmada con otro secreto (por ejemplo, alguien que corre este código aparte)
{
  process.env.SESSION_SECRET = "otro-secreto-distinto";
  const conOtro = crearSesion({ playerId: "p1", googleSub: "sub1", nombre: "Pelado" });
  process.env.SESSION_SECRET = "secreto-de-prueba-que-no-es-el-de-produccion";
  assert.strictEqual(leerSesion(conOtro), null, "Otro secreto no debe validar acá");
  console.log("  ✓ Una sesión firmada con otro secreto no vale");
}

// Vencimiento
{
  const cuerpo = Buffer.from(JSON.stringify({ pid: "p1", exp: Date.now() - 1000 })).toString("base64url");
  const crypto = await import("node:crypto");
  const firma = crypto
    .createHmac("sha256", process.env.SESSION_SECRET)
    .update(cuerpo)
    .digest("base64url");
  assert.strictEqual(leerSesion(`${cuerpo}.${firma}`), null, "Una sesión vencida no vale aunque la firma sea buena");
  console.log("  ✓ Una sesión vencida se rechaza aunque esté bien firmada");
}

// Basura variada: nunca debe tirar una excepción
{
  for (const basura of [null, undefined, "", ".", "asdf", "a.b", {}, 42, "....", "a.b.c.d"]) {
    assert.strictEqual(leerSesion(basura), null, `Debe rechazar sin romperse: ${JSON.stringify(basura)}`);
  }
  console.log("  ✓ Entrada basura se rechaza sin tirar excepciones");
}

// Ticket de socket: corto y suficiente para conectarse
{
  const ticket = crearTicketSocket({ playerId: "p1", nombre: "Pelado" });
  const leido = leerSesion(ticket);
  assert.strictEqual(leido.pid, "p1");
  assert.ok(leido.exp - Date.now() <= 2 * 60 * 1000, "El ticket no debe durar más de 2 minutos");
  assert.ok(leido.exp - Date.now() > 60 * 1000, "Pero tiene que alcanzar para conectarse");
  console.log("  ✓ El ticket de socket es válido y de vida corta");
}

// Atributos de la cookie
{
  const opciones = opcionesCookie();
  assert.strictEqual(opciones.httpOnly, true, "HttpOnly es lo que la protege de un XSS");
  assert.strictEqual(opciones.sameSite, "lax", "Lax deja volver desde Google pero no sirve a terceros");
  assert.strictEqual(opciones.path, "/");
  console.log("  ✓ La cookie sale con los atributos que la protegen");
}

console.log("\n¡Todos los tests de sesión pasaron exitosamente!");
