import pages from './customPages/pages';

export const dynamic = 'force-dynamic';

export default function RootPage() {
  const PageComp = pages['/'];

  // 1/100 chance to show the coriglia image directly
  const showCoriglia = Math.random() < 0.01;

  if (showCoriglia) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#000' }}>
        <img src="/imgs/coriglia.webp" alt="Coriglia" style={{ maxWidth: '90%', maxHeight: '90vh', objectFit: 'contain' }} />
      </div>
    );
  }

  if (!PageComp) {
    return (
      <div style={{ color: '#fff', textAlign: 'center', marginTop: '50px' }}>
        No home page registered.
      </div>
    );
  }

  // When not showing the special image, render the normal page
  // but pass a flag to avoid rendering `coriglia.webp` inside subpages.
  return <PageComp hideCoriglia={true} />;
}
