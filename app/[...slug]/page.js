import { notFound } from 'next/navigation';
import pages from '../customPages/pages';

export default function CatchAllPage({ params }) {
  const slug = params?.slug ?? [];
  const path = '/' + (Array.isArray(slug) ? slug.join('/') : slug);
  const PageComp = pages[path];
  if (!PageComp) return notFound();
  return <PageComp />;
}