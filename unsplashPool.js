// picsumPool.js — picsum.photos seed-based image pool for reliable covers
// ~60 seeded images across music categories. Each URL is a stable picsum.photos seed.

const POOL = {
  Happy: [
    'https://picsum.photos/seed/happy-1/1600/900',
    'https://picsum.photos/seed/happy-2/1600/900',
    'https://picsum.photos/seed/happy-3/1600/900',
    'https://picsum.photos/seed/happy-4/1600/900',
    'https://picsum.photos/seed/happy-5/1600/900',
    'https://picsum.photos/seed/happy-6/1600/900'
  ],

  Calm: [
    'https://picsum.photos/seed/calm-1/1600/900',
    'https://picsum.photos/seed/calm-2/1600/900',
    'https://picsum.photos/seed/calm-3/1600/900',
    'https://picsum.photos/seed/calm-4/1600/900',
    'https://picsum.photos/seed/calm-5/1600/900',
    'https://picsum.photos/seed/calm-6/1600/900'
  ],

  Cinematic: [
    'https://picsum.photos/seed/cinematic-1/1600/900',
    'https://picsum.photos/seed/cinematic-2/1600/900',
    'https://picsum.photos/seed/cinematic-3/1600/900',
    'https://picsum.photos/seed/cinematic-4/1600/900',
    'https://picsum.photos/seed/cinematic-5/1600/900'
  ],

  Relax: [
    'https://picsum.photos/seed/relax-1/1600/900',
    'https://picsum.photos/seed/relax-2/1600/900',
    'https://picsum.photos/seed/relax-3/1600/900',
    'https://picsum.photos/seed/relax-4/1600/900'
  ],

  Ambient: [
    'https://picsum.photos/seed/ambient-1/1600/900',
    'https://picsum.photos/seed/ambient-2/1600/900',
    'https://picsum.photos/seed/ambient-3/1600/900',
    'https://picsum.photos/seed/ambient-4/1600/900'
  ],

  Acoustic: [
    'https://picsum.photos/seed/acoustic-1/1600/900',
    'https://picsum.photos/seed/acoustic-2/1600/900',
    'https://picsum.photos/seed/acoustic-3/1600/900',
    'https://picsum.photos/seed/acoustic-4/1600/900'
  ],

  Electronic: [
    'https://picsum.photos/seed/electronic-1/1600/900',
    'https://picsum.photos/seed/electronic-2/1600/900',
    'https://picsum.photos/seed/electronic-3/1600/900',
    'https://picsum.photos/seed/electronic-4/1600/900'
  ],

  Piano: [
    'https://picsum.photos/seed/piano-1/1600/900',
    'https://picsum.photos/seed/piano-2/1600/900',
    'https://picsum.photos/seed/piano-3/1600/900'
  ],

  Jazz: [
    'https://picsum.photos/seed/jazz-1/1600/900',
    'https://picsum.photos/seed/jazz-2/1600/900',
    'https://picsum.photos/seed/jazz-3/1600/900'
  ],

  Lofi: [
    'https://picsum.photos/seed/lofi-1/1600/900',
    'https://picsum.photos/seed/lofi-2/1600/900',
    'https://picsum.photos/seed/lofi-3/1600/900'
  ],

  Energetic: [
    'https://picsum.photos/seed/energetic-1/1600/900',
    'https://picsum.photos/seed/energetic-2/1600/900',
    'https://picsum.photos/seed/energetic-3/1600/900'
  ],

  Dramatic: [
    'https://picsum.photos/seed/dramatic-1/1600/900',
    'https://picsum.photos/seed/dramatic-2/1600/900',
    'https://picsum.photos/seed/dramatic-3/1600/900'
  ],

  'Hip-Hop': [
    'https://picsum.photos/seed/hiphop-1/1600/900',
    'https://picsum.photos/seed/hiphop-2/1600/900',
    'https://picsum.photos/seed/hiphop-3/1600/900'
  ],

  Rock: [
    'https://picsum.photos/seed/rock-1/1600/900',
    'https://picsum.photos/seed/rock-2/1600/900',
    'https://picsum.photos/seed/rock-3/1600/900'
  ],

  Classical: [
    'https://picsum.photos/seed/classical-1/1600/900',
    'https://picsum.photos/seed/classical-2/1600/900',
    'https://picsum.photos/seed/classical-3/1600/900'
  ],

  Default: [
    'https://picsum.photos/seed/default-1/1600/900',
    'https://picsum.photos/seed/default-2/1600/900',
    'https://picsum.photos/seed/default-3/1600/900',
    'https://picsum.photos/seed/default-4/1600/900',
    'https://picsum.photos/seed/default-5/1600/900',
    'https://picsum.photos/seed/default-6/1600/900'
  ]
};

const flatten = () => Object.values(POOL).flat();

function getRandomFromArray(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomImageForCategory(category) {
  if (!category) return getRandomFromArray(flatten());
  const key = Object.keys(POOL).find(k => k.toLowerCase() === category.toLowerCase());
  if (key) return getRandomFromArray(POOL[key]);
  // fallback: try to match partial category words
  for (const k of Object.keys(POOL)) {
    if (category.toLowerCase().includes(k.toLowerCase())) return getRandomFromArray(POOL[k]);
  }
  return getRandomFromArray(POOL.Default || flatten());
}

module.exports = { POOL, getRandomImageForCategory };
