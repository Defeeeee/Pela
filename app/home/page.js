import fs from 'fs';
import path from 'path';
import LoadingScreen from '../LoadingScreen';
import sharp from 'sharp';

export default async function Home() {
  const IMGS_DIR = path.join(process.cwd(), 'public', 'imgs', 'goat');
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

  const fileName = files[Math.floor(Math.random() * files.length)];
  const imagePath = path.join(IMGS_DIR, fileName);
  const stats = await getImageData(imagePath);

  let extraDelay = Math.floor(Math.random() * 4001) - 2000; // -2000ms to +2000ms
  const title = fileName.replace(/\.[^/.]+$/, '').replace(/\b\w/g, c => c.toUpperCase());
  const maxDelayFromImage = Math.floor(Math.random() * 2001); // 0 to 2000ms

  if (stats.height * stats.width > maxDelayFromImage) {
    extraDelay -= stats.height * stats.width - maxDelayFromImage;
  }

  const delay = Math.max(0, stats.height * stats.width + extraDelay);
  
  return (
    <LoadingScreen fileName={fileName} delay={delay} initialTitle={title} />
  );
}

export async function getImageData(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  const image = sharp(imageBuffer);

  const metadata = await image.metadata();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

  return {
    width: metadata.width,
    height: metadata.height,
    pixelArray: data,
    channels: info.channels
  };
}