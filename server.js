import express from "express";
import multer from "multer";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// middleware
app.use(express.json());
app.use(express.static("public"));
// kasih akses ke file PDF yang diupload
app.use("/uploads", express.static("uploads"));

// SQLite setup
const db = await open({
  filename: "./db/arsip.sqlite",
  driver: sqlite3.Database,
});

// buat tabel jika belum ada
await db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );
`);
await db.exec(`
  CREATE TABLE IF NOT EXISTS archives (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category_id INTEGER,
    description TEXT,
    file_path TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );
`);

// default categories
await db.run(`INSERT OR IGNORE INTO categories (id,name) VALUES
 (1,'Undangan'),(2,'Pengumuman'),(3,'Nota Dinas'),(4,'Pemberitahuan')`);

// storage PDF
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// --- API Routes --- //
// arsip list (search)
app.get("/api/archives", async (req, res) => {
  const q = req.query.q || "";
  const rows = await db.all(
    "SELECT a.*, c.name as category FROM archives a LEFT JOIN categories c ON a.category_id=c.id WHERE a.title LIKE ? ORDER BY a.created_at DESC",
    [`%${q}%`]
  );
  res.json(rows);
});

// tambah arsip
app.post("/api/archives", upload.single("file"), async (req, res) => {
  const { title, category_id, description } = req.body;
  if (!req.file) return res.status(400).json({ error: "File PDF wajib" });

  const stmt = await db.run(
    "INSERT INTO archives (title, category_id, description, file_path) VALUES (?,?,?,?)",
    [title, category_id, description, req.file.filename]
  );
  res.json({ success: true, id: stmt.lastID });
});

// detail arsip
app.get("/api/archives/:id", async (req, res) => {
  const row = await db.get(
    "SELECT a.*, c.name as category FROM archives a LEFT JOIN categories c ON a.category_id=c.id WHERE a.id=?",
    [req.params.id]
  );
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

// unduh
app.get("/api/archives/:id/download", async (req, res) => {
  const row = await db.get("SELECT * FROM archives WHERE id=?", [req.params.id]);
  if (!row) return res.status(404).send("Not found");
  res.download(path.join("uploads", row.file_path));
});

// hapus arsip
app.delete("/api/archives/:id", async (req, res) => {
  const row = await db.get("SELECT * FROM archives WHERE id=?", [req.params.id]);
  if (row) {
    fs.unlinkSync(path.join("uploads", row.file_path));
    await db.run("DELETE FROM archives WHERE id=?", [req.params.id]);
  }
  res.json({ success: true });
});

// kategori CRUD
app.get("/api/categories", async (req, res) => {
  const rows = await db.all("SELECT * FROM categories ORDER BY id DESC");
  res.json(rows);
});
app.post("/api/categories", async (req, res) => {
  const { name } = req.body;
  const stmt = await db.run("INSERT INTO categories (name) VALUES (?)", [name]);
  res.json({ success: true, id: stmt.lastID });
});
app.put("/api/categories/:id", async (req, res) => {
  await db.run("UPDATE categories SET name=? WHERE id=?", [
    req.body.name,
    req.params.id,
  ]);
  res.json({ success: true });
});
app.delete("/api/categories/:id", async (req, res) => {
  await db.run("DELETE FROM categories WHERE id=?", [req.params.id]);
  res.json({ success: true });
});

// start server
app.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);
