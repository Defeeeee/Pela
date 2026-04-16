import { notFound } from 'next/navigation';
import pages from '../customPages/pages';

export default async function CatchAllPage({ params, searchParams }) {
  const resolvedParams = await params;
  const slug = resolvedParams?.slug ?? [];
  const path = '/' + (Array.isArray(slug) ? slug.join('/') : slug);
  const PageComp = pages[path];
  if (!PageComp) return notFound();
  return <PageComp searchParams={searchParams} />;
}