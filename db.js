// const path = require('path');
// const sqlite3 = require('sqlite3').verbose();
// const dbPath = path.join(__dirname, 'database.sqlite3');
// const db = new sqlite3.Database(dbPath);

// db.serialize(() => {
//   db.run(`CREATE TABLE IF NOT EXISTS users (
//     id INTEGER PRIMARY KEY,
//     email TEXT UNIQUE,
//     passwordHash TEXT,
//     previews TEXT,
//     created_at DATETIME DEFAULT CURRENT_TIMESTAMP
//   )`);

//   db.run(`CREATE TABLE IF NOT EXISTS songs (
//     id INTEGER PRIMARY KEY,
//     title TEXT,
//     subtitle TEXT,
//     category TEXT,
//     filename TEXT,
//     cover_url TEXT,
//     isActive INTEGER DEFAULT 1,
//     created_at DATETIME DEFAULT CURRENT_TIMESTAMP
//   )`);

//   // admin-managed categories
//   db.run(`CREATE TABLE IF NOT EXISTS categories (
//     id INTEGER PRIMARY KEY,
//     name TEXT UNIQUE,
//     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
//     isactive BOOLEAN DEFAULT 1
//   )`);

//   // text entries that can be associated with a category (admin can add/paste text)
//   db.run(`CREATE TABLE IF NOT EXISTS texts (
//     id INTEGER PRIMARY KEY,
//     category TEXT,
//     content TEXT,
//     created_at DATETIME DEFAULT CURRENT_TIMESTAMP
//   )`);

//   // ensure `cover_url`, `subtitle` and `isActive` columns exist for older DBs
//   db.all("PRAGMA table_info('songs')", [], (err, rows) => {
//     if (err) return;
//     const cols = (rows || []).map(r => r.name);
//     if (!cols.includes('cover_url')) {
//       try { db.run("ALTER TABLE songs ADD COLUMN cover_url TEXT"); } catch (e) { /* ignore */ }
//     }
//     if (!cols.includes('subtitle')) {
//       try { db.run("ALTER TABLE songs ADD COLUMN subtitle TEXT"); } catch (e) { /* ignore */ }
//     }
//     if (!cols.includes('isActive')) {
//       try { db.run("ALTER TABLE songs ADD COLUMN isActive INTEGER DEFAULT 1"); } catch (e) { /* ignore */ }
//     }
//   });
// });

// module.exports = db;



require('dotenv').config();
const mysql = require('mysql2');

// Create connection pool (better for production)

const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 2,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});



// Test connection
db.getConnection((err, connection) => {
  if (err) {
    console.error('Database connection failed:', err.message);
  } else {
    console.log('Connected to MySQL database');
    connection.release();
  }
});

module.exports = db;
