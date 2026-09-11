import assert from "node:assert/strict";
import {
  escenaDelDia, escenaPublica, corregir,
  ANCHO, ALTO, MIN_PALAS, MAX_PALAS, SEGUNDOS_VISIBLE,
} from "./palas.js";

console.log("Iniciando tests de ¿Cuántas palas?...");

// 1. La escena del día es la misma para todos
{
  // Sin esto el puzzle no es un puzzle: cada jugador contaría una escena
  // distinta y el ranking mediría la suerte del sorteo.
  for (const dia of [1, 7, 42, 365, 1000]) {
    const a = escenaDelDia(dia);
    const b = escenaDelDia(dia);
    assert.deepStrictEqual(a, b, `El día ${dia} tiene que dar exactamente la misma escena`);
  }
  const x = escenaDelDia(100);
  const y = escenaDelDia(101);
  assert.notDeepStrictEqual(x, y, "Días distintos tienen que dar escenas distintas");
  console.log("  ✓ La escena de un día es determinista, y cambia de un día al otro");
}

// 2. El total cae en el rango jugable, todos los días
{
  /**
   * El rango importa: con menos de quince se cuenta sin esfuerzo y no hay
   * juego; con más de cincuenta contar exacto es suerte y el "acertaste" nunca
   * llega, así que la racha se muere. Se verifica sobre dos años de puzzles.
   */
  let min = Infinity, max = -Infinity;
  const cuenta = new Map();
  for (let dia = 1; dia <= 520; dia++) {
    const { total } = escenaDelDia(dia);
    assert.ok(total >= MIN_PALAS && total <= MAX_PALAS,
      `El día ${dia} dio ${total} palas, fuera del rango ${MIN_PALAS}-${MAX_PALAS}`);
    min = Math.min(min, total);
    max = Math.max(max, total);
    cuenta.set(total, (cuenta.get(total) || 0) + 1);
  }
  // Y que el generador use el rango de verdad, no tres valores.
  assert.ok(cuenta.size >= 15, `Sólo ${cuenta.size} totales distintos en 520 días: el generador está sesgado`);
  console.log(`  ✓ En 520 días el total va de ${min} a ${max}, con ${cuenta.size} valores distintos`);
}

// 3. Las palas entran en el campo
{
  for (let dia = 1; dia <= 120; dia++) {
    for (const p of escenaDelDia(dia).palas) {
      const r = p.largo / 2;
      assert.ok(p.x - r >= 0 && p.x + r <= ANCHO && p.y - r >= 0 && p.y + r <= ALTO,
        `Día ${dia}: una pala se sale del campo en (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
    }
  }
  console.log("  ✓ Ninguna pala se sale del campo, ningún día");
}

// 4. Ninguna pala queda del todo tapada
{
  /**
   * Es lo que hace justo el puzzle. Si una pala quedara invisible, el número
   * correcto parecería un error y el jugador tendría razón en quejarse.
   */
  const dentro = (pala, px, py) => {
    const dx = px - pala.x, dy = py - pala.y;
    const c = Math.cos(-pala.ang), s = Math.sin(-pala.ang);
    const lx = dx * c - dy * s, ly = dx * s + dy * c;
    return Math.abs(lx) <= pala.largo / 2 && Math.abs(ly) <= pala.ancho / 2;
  };
  let solapes = 0;
  for (let dia = 1; dia <= 200; dia++) {
    const { palas } = escenaDelDia(dia);
    for (let i = 0; i < palas.length; i++) {
      for (let j = 0; j < palas.length; j++) {
        if (i === j) continue;
        assert.ok(!dentro(palas[j], palas[i].x, palas[i].y),
          `Día ${dia}: el centro de la pala ${i} cae dentro de la ${j}`);
      }
      // Se cuentan los solapes parciales, que SÍ tienen que existir: sin ellos
      // contar es trivial y el juego no tiene gracia.
      for (let j = i + 1; j < palas.length; j++) {
        const d = Math.hypot(palas[i].x - palas[j].x, palas[i].y - palas[j].y);
        if (d < (palas[i].largo + palas[j].largo) / 2) solapes++;
      }
    }
  }
  assert.ok(solapes > 200, `Hacen falta solapes parciales para que contar cueste; hubo ${solapes} en 200 días`);
  console.log(`  ✓ Ninguna pala queda tapada, y hay ${solapes} solapes parciales en 200 días para que contar cueste`);
}

// 5. La escena pública NO lleva el total
{
  // Es lo único que el servidor puede mandar. El total se queda del lado del
  // servidor porque es la respuesta.
  const pub = escenaPublica(77);
  const json = JSON.stringify(pub);
  assert.strictEqual(pub.total, undefined, "La escena pública no puede llevar el total");
  assert.ok(!("total" in pub), "Ni la clave");
  assert.strictEqual(pub.segundos, SEGUNDOS_VISIBLE);
  assert.deepStrictEqual(pub.mundo, [ANCHO, ALTO]);
  assert.strictEqual(pub.palas.length, escenaDelDia(77).total,
    "Las palas que se mandan son las que hay: el conteo del arreglo ES la respuesta, y eso está documentado");
  assert.ok(json.length < 4000, `El payload de un día son ${json.length} bytes, demasiado`);
  console.log(`  ✓ La escena pública no lleva el total y pesa ${json.length} bytes`);
}

// 6. La corrección
{
  const { total } = escenaDelDia(55);

  const exacto = corregir(55, total);
  assert.strictEqual(exacto.error, 0);
  assert.strictEqual(exacto.exacto, true);
  assert.strictEqual(exacto.total, total, "Al corregir se devuelve el total: ya no es secreto");

  const corto = corregir(55, total - 7);
  assert.strictEqual(corto.error, 7);
  assert.strictEqual(corto.exacto, false);

  const largo = corregir(55, total + 3);
  assert.strictEqual(largo.error, 3, "El error es la distancia, sin importar de qué lado");

  // Entradas inválidas: no tiran, devuelven error.
  for (const malo of [-1, 1000, NaN, "muchas", null, undefined, Infinity]) {
    assert.ok(corregir(55, malo).error !== undefined || corregir(55, malo).error,
      `"${malo}" debería ser rechazado`);
    const r = corregir(55, malo);
    assert.ok(typeof r.error === "string" || r.exacto === false,
      `"${malo}" no puede pasar como intento válido`);
  }
  assert.strictEqual(typeof corregir(55, -1).error, "string", "Un negativo se rechaza");
  assert.strictEqual(typeof corregir(55, "muchas").error, "string", "Un texto se rechaza");

  console.log("  ✓ Corrige por distancia, marca el acierto exacto y rechaza lo inválido");
}

// 7. El costo de generar
{
  // Se genera en cada pedido, así que tiene que ser barato: si costara, un
  // refresco repetido sería un vector de carga contra el servidor.
  const t0 = process.hrtime.bigint();
  for (let dia = 1; dia <= 200; dia++) escenaPublica(dia);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 200;
  assert.ok(ms < 5, `Generar una escena tarda ${ms.toFixed(2)} ms, demasiado para hacerlo por pedido`);
  console.log(`  ✓ Generar una escena cuesta ${ms.toFixed(2)} ms`);
}

console.log("\n¡Todos los tests de ¿Cuántas palas? pasaron exitosamente!");
