import pages from './customPages/pages';

export const dynamic = 'force-dynamic';

export default function RootPage() {
  const PageComp = pages['/'];
  if (!PageComp) {
    return (
      <div style={{ color: '#fff', textAlign: 'center', marginTop: '50px' }}>
        No home page registered.
      </div>
    );
  }
  return <PageComp />;
}
