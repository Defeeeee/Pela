import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function normalizeCandidates(value) {
  const candidates = new Set();
  if (!value) return [];

  candidates.add(value);
  candidates.add(String(value).replace(/\+/g, ' '));

  try {
    candidates.add(decodeURIComponent(value));
  } catch (e) {}

  try {
    candidates.add(decodeURIComponent(String(value).replace(/\+/g, ' ')));
  } catch (e) {}

  return Array.from(candidates).filter(Boolean).map(v => String(v).toLowerCase());
}

function matchRequestedFile(files, requestedRaw) {
  const candidates = normalizeCandidates(requestedRaw);
  if (!candidates.length) return null;

  for (const f of files) {
    if (candidates.includes(f.toLowerCase())) {
      return f;
    }
  }

  for (const c of candidates) {
    const base = c.replace(/\.[^/.]+$/, '');
    for (const f of files) {
      if (f.toLowerCase().replace(/\.[^/.]+$/, '') === base) {
        return f;
      }
    }
  }

  return null;
}

export default async function InstantPage({ searchParams }) {
  const IMGS_DIR = path.join(process.cwd(), 'public', 'imgs');
  const files = fs.existsSync(IMGS_DIR)
    ? fs.readdirSync(IMGS_DIR).filter(f => /\.(jpe?g|png|gif|webp)$/i.test(f))
    : [];

  if (!files.length) {
    return (
      <div style={{ color: '#fff', textAlign: 'center', marginTop: '50px' }}>
        No images found in public/imgs folder.
      </div>
    );
  }

  const resolvedSearchParams = await searchParams;

  let requested = null;
  if (resolvedSearchParams instanceof URLSearchParams) {
    requested = resolvedSearchParams.get('file');
  } else {
    const fileParam = resolvedSearchParams?.file;
    requested = Array.isArray(fileParam) ? fileParam[0] : fileParam;
  }

  const matched = matchRequestedFile(files, requested);
  const fileName = matched || files[Math.floor(Math.random() * files.length)];
  const title = fileName.replace(/\.[^/.]+$/, '').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/imgs/${encodeURIComponent(fileName)}`}
        alt={title}
        style={{ width: '100vw', height: '100vh', objectFit: 'fill' }}
      />
    </div>
  );
}
