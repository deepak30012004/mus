const express = require('express');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const db = require('./db');
const { getRandomImageForCategory } = require('./unsplashPool');

const app = express();
app.use(express.json());
// during local development allow requests from any origin (fixes localhost/127.0.0.1 mismatch)
app.use(cors());

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'E-Music API',
      version: '1.0.0',
      description: 'Royalty-free music download API with preview and authentication',
      contact: {
        name: 'E-Music Support',
        email: 'support@e-music.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:4000',
        description: 'Development server'
      }
    ],
    tags: [
      {
        name: 'Songs',
        description: 'Song browsing, preview, and download endpoints'
      },
      {
        name: 'Authentication',
        description: 'User authentication and registration'
      },
      {
        name: 'Preview',
        description: 'Preview request and management'
      },
      {
        name: 'Payment',
        description: 'Payment simulation endpoints'
      },
      {
        name: 'Admin',
        description: 'Admin-only endpoints for content management'
      }
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token (user or preview token)'
        },
        AdminToken: {
          type: 'apiKey',
          in: 'header',
          name: 'x-admin-token',
          description: 'Admin JWT token'
        }
      },
      schemas: {
        Song: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            title: { type: 'string', example: 'Ambient Dreams' },
            category: { type: 'string', example: 'Ambient' },
            filename: { type: 'string', example: 'ambient-dreams.mp3' },
            cover_url: { type: 'string', example: '/covers/cover-1.jpg' }
          }
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            email: { type: 'string', example: 'user@example.com' },
            previews: { type: 'string', example: '{}' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Error message' }
          }
        }
      }
    }
  },
  apis: ['./index.js']
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'E-Music API Documentation'
}));

// ensure local covers directory exists and serve it
const COVERS_DIR = path.join(__dirname, 'covers');
if (!fs.existsSync(COVERS_DIR)) fs.mkdirSync(COVERS_DIR);
app.use('/covers', express.static(COVERS_DIR));

// Serve uploads directory for testing (allow public access to test audio files)
const UPLOADS_DIR = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(UPLOADS_DIR));

// helper: download remote image and save locally
async function downloadImageTo(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
}

// backfill existing songs: if cover_url is missing or points to a remote URL, download a stable local copy
(async function backfillCovers(){
  try {
    db.query("SELECT id, category, cover_url FROM songs WHERE cover_url IS NULL OR cover_url = '' OR cover_url LIKE 'http%'", [], async (err, rows) => {
      if (err || !rows || rows.length === 0) return;
      for (const r of rows) {
        try {
          const remote = getRandomImageForCategory(r.category);
          const filename = `cover-${r.id}-${Date.now()}.jpg`;
          const dest = path.join(COVERS_DIR, filename);
          await downloadImageTo(remote, dest);
          const localUrl = `/covers/${filename}`;
          db.query('UPDATE songs SET cover_url = ? WHERE id = ?', [localUrl, r.id]);
        } catch (e) {
          // on failure keep any existing cover_url or leave null — not critical
        }
      }
    });
  } catch (e) {
    /* ignore backfill errors */
  }
})();

const UPLOADS = path.join(__dirname, 'uploads');
const PORT = process.env.PORT || 4000;
const JWT_SECRET = 'dev_secret_replace_me';
const ADMIN_SECRET = 'admin_secret_demo';

const upload = multer({ dest: UPLOADS });

/* Helper DB functions */
function findUserByEmail(email) {
  return new Promise((resolve, reject) => {
    db.query(
      'SELECT * FROM users WHERE email = ?',
      [email],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows[0]); // ✅ return first row only
      }
    );
  });
}


function createUser(email) {
  return new Promise((resolve, reject) => {
    db.query('INSERT  IGNORE INTO users (email, previews) VALUES (?, ?)', [email, JSON.stringify({})], function (err) {
      if (err) return reject(err);
      db.query('SELECT * FROM users WHERE email = ?', [email], (err2, row) => {
        if (err2) return reject(err2);
        resolve(row[0]);
      });
    });
  });
}

function updateUserPreviews(email, previews) {
  return new Promise((resolve, reject) => {
    db.query('UPDATE users SET previews = ? WHERE email = ?', [JSON.stringify(previews), email], function (err) {
      if (err) return reject(err);
      resolve();
    });
  });
}

function setUserPassword(email, passwordHash) {
  return new Promise((resolve, reject) => {
    db.query('UPDATE users SET passwordHash = ? WHERE email = ?', [passwordHash, email], function (err) {
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * @swagger
 * /api/songs:
 *   get:
 *     summary: Get all songs
 *     description: Retrieve a list of all available songs in the database
 *     tags: [Songs]
 *     responses:
 *       200:
 *         description: List of songs
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Song'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
/* Songs */
app.get('/api/songs', (req, res) => {
  db.query('SELECT * FROM songs ORDER BY category, id', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

/**
 * @swagger
 * /api/request-preview:
 *   post:
 *     summary: Request preview access
 *     description: Create or find user account and return preview token
 *     tags: [Preview]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: Preview token created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 previewToken:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Missing email
 *       500:
 *         description: Server error
 */
/* Request preview: create (or find) user and return a short preview token */
app.post('/api/request-preview', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    await createUser(email);
    const previewToken = jwt.sign({ email, type: 'preview' }, JWT_SECRET, { expiresIn: '10m' });
    res.json({ previewToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/pay:
 *   post:
 *     summary: Simulate payment
 *     description: Simulate payment processing (demo endpoint)
 *     tags: [Payment]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - previewToken
 *             properties:
 *               previewToken:
 *                 type: string
 *               simulateFail:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Payment successful
 *       400:
 *         description: Missing preview token
 *       401:
 *         description: Invalid or expired preview token
 *       402:
 *         description: Payment failed (simulated)
 */
/* Simulated payment endpoint */
app.post('/api/pay', (req, res) => {
  const { previewToken, simulateFail } = req.body;
  if (!previewToken) return res.status(400).json({ error: 'previewToken required' });
  try {
    jwt.verify(previewToken, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'invalid or expired preview token' });
  }
  if (simulateFail) return res.status(402).json({ error: 'payment failed (simulated)' });
  // Payment succeeded (simulated)
  res.json({ ok: true });
});

/**
 * @swagger
 * /api/set-password:
 *   post:
 *     summary: Set user password
 *     description: Set password after successful payment
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - previewToken
 *               - password
 *             properties:
 *               previewToken:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password set successfully, returns JWT token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *       400:
 *         description: Missing fields
 *       401:
 *         description: Invalid or expired preview token
 */
/* Set password after successful payment */
app.post('/api/set-password', async (req, res) => {
  const { previewToken, password } = req.body;
  if (!previewToken || !password) return res.status(400).json({ error: 'missing fields' });
  let payload;
  try {
    payload = jwt.verify(previewToken, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'invalid/expired token' });
  }
  const email = payload.email;
  const salt = bcrypt.genSaltSync(8);
  const hash = bcrypt.hashSync(password, salt);
  try {
    await setUserPassword(email, hash);
    const token = jwt.sign({ email, type: 'user' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/login:
 *   post:
 *     summary: User login
 *     description: Login with email and password to get JWT token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       200:
 *         description: Login successful, returns JWT token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *       400:
 *         description: Missing fields
 *       401:
 *         description: Invalid credentials
 */
/* Login (user) */
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'missing fields' });
  try {
    const user = await findUserByEmail(email);
    if (!user || !user.passwordHash) return res.status(401).json({ error: 'no such user or password not set' });
    const ok = bcrypt.compareSync(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    const token = jwt.sign({ email, type: 'user' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* Helper: accept either preview or user token */
function getEmailFromAuthHeader(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  try {
    const p = jwt.verify(token, JWT_SECRET);
    return p.email;
  } catch (err) {
    return null;
  }
}

/**
 * @swagger
 * /api/preview/{id}:
 *   get:
 *     summary: Preview a song
 *     description: Stream a song preview (limited to 5 previews per category)
 *     tags: [Songs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Song ID
 *       - in: header
 *         name: Authorization
 *         schema:
 *           type: string
 *         description: Bearer token (preview or user token)
 *     responses:
 *       200:
 *         description: Audio stream
 *         content:
 *           audio/mpeg:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Missing token or invalid song ID
 *       401:
 *         description: Invalid token
 *       403:
 *         description: Preview limit reached for this category
 *       404:
 *         description: Song not found
 */
/* Preview streaming — enforces 5 previews per category */
app.get('/api/preview/:id', async (req, res) => {
  const songId = req.params.id;
  const email = getEmailFromAuthHeader(req);
  if (!email) return res.status(401).json({ error: 'authorization required (preview token or user token)' });

  db.query('SELECT * FROM songs WHERE id = ?', [songId], async (err, song) => {
    if (err || !song) return res.status(404).json({ error: 'song not found' });
    try {
      let user = await findUserByEmail(email);
      if (!user) {
        await createUser(email);
        user = await findUserByEmail(email);
      }
      const previews = user.previews ? JSON.parse(user.previews) : {};
      const count = previews[song.category] || 0;
      if (count >= 5) return res.status(403).json({ error: 'preview limit reached for this category (5)' });
      previews[song.category] = count + 1;
      await updateUserPreviews(email, previews);

      const filePath = path.join(UPLOADS, song.filename);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'file missing on server' });
      res.setHeader('Content-Type', 'audio/mpeg');
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

/* Secure download — requires user token (password-set user) and at least one preview slot used in that category */
function verifyUserToken(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'token required' });
  const token = auth.slice(7);
  try {
    const p = jwt.verify(token, JWT_SECRET);
    if (p.type !== 'user') return res.status(401).json({ error: 'invalid token type' });
    req.userEmail = p.email;
    next();
  } catch (err) {
    res.status(401).json({ error: 'invalid/expired token' });
  }
}

/**
 * @swagger
 * /api/download/{id}:
 *   get:
 *     summary: Download a song
 *     description: Download a full song (requires user token and preview allowance)
 *     tags: [Songs]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Song ID
 *     responses:
 *       200:
 *         description: Audio file download
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Token required or invalid
 *       403:
 *         description: No download allowance for this category
 *       404:
 *         description: Song not found
 */
app.get('/api/download/:id', verifyUserToken, async (req, res) => {
  const songId = req.params.id;
  const email = req.userEmail;
  db.query('SELECT * FROM songs WHERE id = ?', [songId], async (err, song) => {
    if (err || !song) return res.status(404).json({ error: 'song not found' });
    try {
      const user = await findUserByEmail(email);
      if (!user || !user.previews) return res.status(403).json({ error: 'no access' });
      const previews = JSON.parse(user.previews || '{}');
      const count = previews[song.category] || 0;
      if (count <= 0) return res.status(403).json({ error: 'no preview/download allowance left for this category' });
      // stream file as attachment
      const filePath = path.join(UPLOADS, song.filename);
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'file missing' });
      res.setHeader('Content-Disposition', `attachment; filename="${song.filename}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

/**
 * @swagger
 * /api/admin/login:
 *   post:
 *     summary: Admin login
 *     description: Login as admin to get admin JWT token
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 example: ravi
 *               password:
 *                 type: string
 *                 example: "1234"
 *     responses:
 *       200:
 *         description: Admin login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *       401:
 *         description: Invalid admin credentials
 */
/* Admin: simple hardcoded login */
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'ravi' && password === '1234') {
    const token = jwt.sign({ admin: true }, ADMIN_SECRET, { expiresIn: '7d' });
    return res.json({ token });
  }
  res.status(401).json({ error: 'invalid admin credentials' });
});

function verifyAdmin(req, res, next) {
  const auth = req.headers['x-admin-token'];
  if (!auth) return res.status(401).json({ error: 'admin token required' });
  try {
    jwt.verify(auth, ADMIN_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'invalid admin token' });
  }
}

// ensure category exists in `categories` table (no-op if already present)
function ensureCategoryExists(name) {
  return new Promise((resolve, reject) => {
    if (!name) return resolve();
    db.query('INSERT  IGNORE INTO categories (name) VALUES (?)', [String(name)], function (err) {
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * @swagger
 * /api/admin/upload:
 *   post:
 *     summary: Upload a song
 *     description: Upload a new song file (admin only)
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - file
 *             properties:
 *               title:
 *                 type: string
 *               category:
 *                 type: string
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Song uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *       400:
 *         description: Missing fields
 *       401:
 *         description: Admin token required
 */
app.post('/api/admin/upload', verifyAdmin, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), async (req, res) => {
  let { title, category, subtitle, isActive } = req.body;
  // multer fields: req.files.file (array) and req.files.cover (array)
  const file = (req.files && req.files.file && req.files.file[0]) || null;
  if (!title || !file) return res.status(400).json({ error: 'missing fields (title or file)' });

  // default category when not provided
  category = (category && String(category).trim()) ? String(category).trim() : 'Default';

  // ensure category is present in admin categories table
  try { await ensureCategoryExists(category); } catch (e) { /* ignore */ }

  const filename = file.filename; // multer stored name
  const originalExt = path.extname(file.originalname) || '.mp3';
  const storedName = filename + originalExt;
  fs.renameSync(path.join(UPLOADS, filename), path.join(UPLOADS, storedName));

  // cover: prefer uploaded cover file, otherwise try to download one for the category
  let localCover = null;
  const coverFileUploaded = (req.files && req.files.cover && req.files.cover[0]) || null;
  try {
    if (coverFileUploaded) {
      const cf = coverFileUploaded;
      const ext = path.extname(cf.originalname) || '.jpg';
      const destName = `cover-${Date.now()}-${Math.floor(Math.random()*10000)}${ext}`;
      const dest = path.join(COVERS_DIR, destName);
      fs.renameSync(path.join(UPLOADS, cf.filename), dest);
      localCover = `/covers/${destName}`;
    } else {
      const remote = getRandomImageForCategory(category);
      const coverFile = `cover-${Date.now()}-${Math.floor(Math.random()*10000)}.jpg`;
      const dest = path.join(COVERS_DIR, coverFile);
      await downloadImageTo(remote, dest);
      localCover = `/covers/${coverFile}`;
    }
  } catch (e) {
    // ignore cover errors
  }

  // normalize subtitle/isActive
  subtitle = subtitle ? String(subtitle) : null;
  const activeFlag = (String(isActive || '1') === '0') ? 0 : 1;

  db.query(
  'INSERT INTO songs (title, subtitle, category, filename, cover_url, isActive) VALUES (?, ?, ?, ?, ?, ?)',
  [title, subtitle, category, storedName, localCover, activeFlag],
  function (err, result) {   // ✅ add result here
    if (err) return res.status(500).json({ error: err.message });

    res.json({
      id: result.insertId,   // ✅ now valid
      title,
      subtitle,
      category,
      filename: storedName,
      cover_url: localCover,
      isActive: !!activeFlag
    });
  }
);

});

// allow authenticated user to set/change their password
app.post('/api/user/set-password', verifyUserToken, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'password required' });
  try {
    const salt = bcrypt.genSaltSync(8);
    const hash = bcrypt.hashSync(password, salt);
    const email = req.userEmail;
    await setUserPassword(email, hash);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * @swagger
 * /api/admin/categories:
 *   get:
 *     summary: Get all categories
 *     description: List all categories from database and songs (admin only)
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of category names
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *       401:
 *         description: Admin token required
 *   post:
 *     summary: Create a category
 *     description: Create a new category (admin only)
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: Rock
 *     responses:
 *       200:
 *         description: Category created
 *       400:
 *         description: Name required
 *       401:
 *         description: Admin token required
 */
// list admin categories (from `categories` table plus any categories already used in songs)
// returns array of objects: { id: number|null, name: string }
app.get('/api/admin/categories', verifyAdmin, (req, res) => {
  db.query('SELECT id, name FROM categories', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const fromTable = (rows || []).map(r => ({ id: r.id, name: r.name }));

    db.query('SELECT DISTINCT category FROM songs', [], (err2, rows2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      const fromSongs = (rows2 || []).map(r => r.category).filter(Boolean);

      // merge song-only categories (give them null id)
      const names = new Set(fromTable.map(c => c.name));
      for (const s of fromSongs) {
        if (!names.has(s)) {
          fromTable.push({ id: null, name: s });
          names.add(s);
        }
      }

      fromTable.sort((a, b) => a.name.localeCompare(b.name));
      res.json(fromTable);
    });
  });
});

// public categories endpoint used by the main site (returns array of names)
app.get('/api/categories', (req, res) => {
  db.query('SELECT name FROM categories', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const fromTable = (rows || []).map(r => String(r.name).trim()).filter(Boolean);
    db.query('SELECT DISTINCT category FROM songs', [], (err2, rows2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      const fromSongs = (rows2 || []).map(r => String(r.category).trim()).filter(Boolean);
      const set = new Set([...fromTable, ...fromSongs]);
      const list = Array.from(set).sort((a,b) => a.localeCompare(b));
      res.json(list);
    });
  });
});

// create a category
app.post('/api/admin/categories', verifyAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    await ensureCategoryExists(name);
    res.json({ name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// rename category by id (updates songs & texts to new name)
/**
 * @swagger
 * /api/admin/categories/{id}:
 *   put:
 *     summary: Rename a category
 *     description: Rename a category by id — songs and texts that referenced the old name will be updated.
 *     tags: [Admin]
 *     security:
 *       - AdminToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Category renamed
 *       400:
 *         description: Missing or invalid input
 *       401:
 *         description: Admin token required
 *       404:
 *         description: Category not found
 */
app.put('/api/admin/categories/:id', verifyAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id and name required' });

  db.query('SELECT name FROM categories WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'category not found' });
    const oldName = row.name;

    db.query('UPDATE categories SET name = ? WHERE id = ?', [name, id], function (err2) {
      if (err2) {
        if (err2.message && err2.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'category name already exists' });
        }
        return res.status(500).json({ error: err2.message });
      }
      // update songs and texts that referenced the old category name
      db.query('UPDATE songs SET category = ? WHERE category = ?', [name, oldName], function (err3) {
        if (err3) return res.status(500).json({ error: err3.message });
        db.query('UPDATE texts SET category = ? WHERE category = ?', [name, oldName], function (err4) {
          if (err4) return res.status(500).json({ error: err4.message });
          res.json({ id, name });
        });
      });
    });
  });
});

// delete category and any associated songs/texts (also removes files from disk) - delete by name (existing)
app.delete('/api/admin/categories/:name', verifyAdmin, (req, res) => {
  const name = req.params.name;
  if (!name) return res.status(400).json({ error: 'name required' });

  // delete song files from disk
  db.query('SELECT filename FROM songs WHERE category = ?', [name], (err, rows) => {
    if (rows && rows.length) {
      for (const r of rows) {
        try { const p = path.join(UPLOADS, r.filename); if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { /* ignore */ }
      }
    }

    db.query('DELETE FROM songs WHERE category = ?', [name], function (err2) {
      if (err2) return res.status(500).json({ error: err2.message });
      db.query('DELETE FROM texts WHERE category = ?', [name], function (err3) {
        if (err3) return res.status(500).json({ error: err3.message });
        db.query('DELETE FROM categories WHERE name = ?', [name], function (err4) {
          if (err4) return res.status(500).json({ error: err4.message });
          res.json({ ok: true });
        });
      });
    });
  });
});

// delete category by id (new) - preserves existing delete-by-name behaviour
/**
 * @swagger
 * /api/admin/categories/id/{id}:
 *   delete:
 *     summary: Delete category by id
 *     description: Delete a category by its database id (removes songs & texts in that category).
 *     tags: [Admin]
 *     security:
 *       - AdminToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Category deleted
 *       401:
 *         description: Admin token required
 *       404:
 *         description: Category not found
 */
app.delete('/api/admin/categories/id/:id', verifyAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'id required' });
  db.query('SELECT name FROM categories WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'category not found' });
    const name = row.name;

    db.query('SELECT filename FROM songs WHERE category = ?', [name], (err2, rows) => {
      if (rows && rows.length) {
        for (const r of rows) {
          try { const p = path.join(UPLOADS, r.filename); if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { /* ignore */ }
        }
      }

      db.query('DELETE FROM songs WHERE category = ?', [name], function (err3) {
        if (err3) return res.status(500).json({ error: err3.message });
        db.query('DELETE FROM texts WHERE category = ?', [name], function (err4) {
          if (err4) return res.status(500).json({ error: err4.message });
          db.query('DELETE FROM categories WHERE id = ?', [id], function (err5) {
            if (err5) return res.status(500).json({ error: err5.message });
            res.json({ ok: true });
          });
        });
      });
    });
  });
});

// upload multiple files at once (drag/drop support)
app.post('/api/admin/upload-multiple', verifyAdmin, upload.array('files'), async (req, res) => {
  const { category } = req.body;
  const titles = req.body.titles || [];
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: 'no files uploaded' });

  const cat = (category && String(category).trim()) ? String(category).trim() : 'Default';
  try { await ensureCategoryExists(cat); } catch (e) { /* ignore */ }

  const results = [];
  // helper to run db.run as promise
  const runAsync = (sql, params) => new Promise((resolve, reject) => db.query(sql, params, function (err) { if (err) return reject(err); resolve(this.lastID); }));

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const originalExt = path.extname(f.originalname) || '.mp3';
    const storedName = f.filename + originalExt;
    try { fs.renameSync(path.join(UPLOADS, f.filename), path.join(UPLOADS, storedName)); } catch (e) { /* ignore */ }
    const title = Array.isArray(titles) ? (titles[i] || f.originalname) : (titles || f.originalname) || f.originalname;

    // try to get a cover for the category
    let localCover = null;
    try {
      const remote = getRandomImageForCategory(cat);
      const coverFile = `cover-${Date.now()}-${Math.floor(Math.random()*10000)}.jpg`;
      const dest = path.join(COVERS_DIR, coverFile);
      await downloadImageTo(remote, dest);
      localCover = `/covers/${coverFile}`;
    } catch (e) { /* ignore */ }

    const id = await runAsync('INSERT INTO songs (title, subtitle, category, filename, cover_url, isActive) VALUES (?, ?, ?, ?, ?, ?)', [title, null, cat, storedName, localCover, 1]);
    results.push({ id, title, subtitle: null, filename: storedName, category: cat, cover_url: localCover, isActive: true });
  }

  res.json(results);
});

// add a text entry (paste/copy) to a category
app.post('/api/admin/text', verifyAdmin, (req, res) => {
  const { category, content } = req.body;
  if (!category || !content) return res.status(400).json({ error: 'category and content required' });
  db.query('INSERT INTO texts (category, content) VALUES (?, ?)', [category, content], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, category, content });
  });
});

// list text entries for a category
app.get('/api/admin/texts', verifyAdmin, (req, res) => {
  const category = req.query.category;
  if (!category) return res.status(400).json({ error: 'category required' });
  db.query('SELECT * FROM texts WHERE category = ? ORDER BY created_at DESC', [category], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

/* Static fallback for production build (if any) */
app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API Documentation available at http://localhost:${PORT}/api-docs`);
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Another process is listening on ${PORT}.`);
    console.error('Fix: stop the other process or set a different PORT (e.g. PORT=4001 npm run dev)');
    process.exit(1);
  }
  console.error('Server error:', err);
  process.exit(1);
});
