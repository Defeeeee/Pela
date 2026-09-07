import { NextResponse } from "next/server";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const puzzle = searchParams.get("puzzle") || "";

    const mpRes = await fetch(`http://127.0.0.1:9315/pelardle/board?puzzle=${encodeURIComponent(puzzle)}`, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });

    if (!mpRes.ok) {
      return NextResponse.json({
        ok: false,
        daily: [],
        history: [],
        offline: true,
        message: "El archivo general de expedientes no respondió.",
      });
    }

    const data = await mpRes.json();
    return NextResponse.json(data);
  } catch (_err) {
    return NextResponse.json({
      ok: false,
      daily: [],
      history: [],
      offline: true,
      message: "No se pudo conectar con el archivo central de legajos.",
    });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { playerId, playerName } = body || {};

    if (!playerId) {
      return NextResponse.json({ ok: false, message: "Falta identificador de legajo (playerId)." }, { status: 400 });
    }

    const mpRes = await fetch("http://127.0.0.1:9315/pelardle/name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, playerName }),
      signal: AbortSignal.timeout(2000),
    });

    if (!mpRes.ok) {
      return NextResponse.json({ ok: false, message: "El archivo general no pudo actualizar el legajo." });
    }

    const data = await mpRes.json();
    return NextResponse.json(data);
  } catch (_err) {
    return NextResponse.json({ ok: false, message: "No se pudo conectar con el archivo central de legajos." });
  }
}
