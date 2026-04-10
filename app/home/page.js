import fs from 'fs';
import path from 'path';
import LoadingScreen from '../LoadingScreen';

export default function Home() {
  const IMGS_DIR = path.join(process.cwd(), 'public', 'imgs');
  const files = fs.readdirSync(IMGS_DIR).filter(f => /\.(jpe?g|png|gif|webp)$/i.test(f));

  if (!files.length) {
    return (
      <div style={{ color: '#fff', textAlign: 'center', marginTop: '50px' }}>
        No images found in public/imgs folder.
      </div>
    );
  }

  const fileName = files[Math.floor(Math.random() * files.length)];
  const delay = Math.floor(Math.random() * 2001) + 2000; // 2000-4000ms
  const title = fileName.replace(/\.[^/.]+$/, '').replace(/\b\w/g, c => c.toUpperCase());

  return <LoadingScreen fileName={fileName} delay={delay} initialTitle={title} />;
}
