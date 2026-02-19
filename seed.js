const db = require('./db');
const { getRandomImageForCategory } = require('./unsplashPool');
const fs = require('fs');
const path = require('path');

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const coversDir = path.join(__dirname, 'covers');
if (!fs.existsSync(coversDir)) fs.mkdirSync(coversDir);

async function downloadTo(destPath, url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('fetch failed');
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buf);
    return true;
  } catch (e) {
    return false;
  }
}

const sampleFiles = [
  { filename: 'happy1.mp3', title: 'Happy Loop', category: 'Happy' },
  { filename: 'happy2.mp3', title: 'Happy Short', category: 'Happy' },
  { filename: 'calm1.mp3', title: 'Calm Ambient', category: 'Calm' },
  { filename: 'cinematic1.mp3', title: 'Cinematic Short', category: 'Cinematic' }
];

sampleFiles.forEach(async (f) => {
  const p = path.join(uploadsDir, f.filename);
  if (!fs.existsSync(p)) {
    // placeholder file for demo
    fs.writeFileSync(p, `Placeholder audio file: ${f.title}`);
  }
  db.get('SELECT id, cover_url FROM songs WHERE filename = ?', [f.filename], async (err, row) => {
    if (err) return console.error(err);
    const remote = getRandomImageForCategory(f.category);
    // attempt to download a local copy
    const coverFile = `seed-${path.parse(f.filename).name}.jpg`;
    const dest = path.join(coversDir, coverFile);
    const ok = await downloadTo(dest, remote);
    const coverUrl = ok ? `/covers/${coverFile}` : remote;
    if (!row) {
      db.query('INSERT INTO songs (title, category, filename, cover_url) VALUES (?, ?, ?, ?)', [f.title, f.category, f.filename, coverUrl]);
    } else if (!row.cover_url) {
      db.query('UPDATE songs SET cover_url = ? WHERE id = ?', [coverUrl, row.id]);
    }
  });
});

console.log('Seeding complete — sample songs added to database and uploads folder.');
