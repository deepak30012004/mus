const fs = require('fs');
const path = require('path');
const https = require('https');

const uploadsDir = path.join(__dirname, 'uploads');

// Free test MP3 files from various sources
const testMP3s = [
  {
    filename: 'happy1.mp3',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'
  },
  {
    filename: 'happy2.mp3',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3'
  },
  {
    filename: 'calm1.mp3',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3'
  },
  {
    filename: 'cinematic1.mp3',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3'
  }
];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`✓ Downloaded: ${dest}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function downloadAllTestMP3s() {
  console.log('Downloading test MP3 files...\n');
  
  for (const mp3 of testMP3s) {
    const destPath = path.join(uploadsDir, mp3.filename);
    
    // Skip if file already exists and is not empty
    if (fs.existsSync(destPath)) {
      const stats = fs.statSync(destPath);
      if (stats.size > 1000) {
        console.log(`⊘ Skipping (already exists): ${mp3.filename}`);
        continue;
      }
    }
    
    try {
      await downloadFile(mp3.url, destPath);
    } catch (error) {
      console.error(`✗ Failed to download ${mp3.filename}:`, error.message);
    }
  }
  
  console.log('\n✓ All test MP3 files downloaded successfully!');
}

downloadAllTestMP3s().catch(console.error);
