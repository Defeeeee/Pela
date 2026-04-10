import fs from 'fs';
import path from 'path';
import LoadingScreen from '../LoadingScreen';
import sharp from 'sharp';
import { start } from 'repl';

export async function Home() {
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

  const stats = await getImageData(path.join(IMGS_DIR, fileName));

  let extraDelay = Math.floor(Math.random() * 4001) - 2000; // -2000ms to +2000ms

  const title = fileName.replace(/\.[^/.]+$/, '').replace(/\b\w/g, c => c.toUpperCase());
  
  const maxDelayFromImage = Math.floor(Math.random() * 4001); + 4000 // 0 to 2000ms

  if (stats.height*stats.width > maxDelayFromImage) {
    extraDelay -= stats.height * stats.width - maxDelayFromImage;
  }

  console.log(stats.height*stats.width+extraDelay)
  return <LoadingScreen fileName={fileName} delay={stats.height * stats.width + extraDelay} initialTitle={title} />;
}

export async function getImageData(path) {
  const imageBuffer = fs.readFileSync(path);

  const image = sharp(imageBuffer);
  
  const metadata = await image.metadata();
  
  const { data, info } = await image
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    width: metadata.width,
    height: metadata.height,
    pixelArray: data,
    channels: info.channels
  };
}