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
