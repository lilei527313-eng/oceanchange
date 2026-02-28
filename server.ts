import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import multer from "multer";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = new Database("tree_chronicle.db");

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    summary TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    original_date TEXT NOT NULL,
    caption TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  )
`);

// Ensure at least one default project exists
const defaultProject = db.prepare("SELECT id FROM projects LIMIT 1").get();
if (!defaultProject) {
  db.prepare("INSERT INTO projects (name, description) VALUES (?, ?)").run("我的大树", "记录门前大树的变化");
}

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

app.use("/uploads", express.static(uploadsDir));

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// API Routes - Projects
app.get("/api/projects", (req, res) => {
  const projects = db.prepare(`
    SELECT p.*, 
    (SELECT filename FROM photos WHERE project_id = p.id ORDER BY original_date DESC LIMIT 1) as latest_photo
    FROM projects p 
    ORDER BY p.created_at DESC
  `).all();
  res.json(projects);
});

app.post("/api/projects", (req, res) => {
  const { name, description } = req.body;
  const info = db.prepare("INSERT INTO projects (name, description) VALUES (?, ?)").run(name, description || "");
  res.json({ id: info.lastInsertRowid, name, description, status: 'active' });
});

app.patch("/api/projects/:id", (req, res) => {
  const { id } = req.params;
  const { name, description, summary, status } = req.body;
  
  const updates: string[] = [];
  const params: any[] = [];

  if (name !== undefined) { updates.push("name = ?"); params.push(name); }
  if (description !== undefined) { updates.push("description = ?"); params.push(description); }
  if (summary !== undefined) { updates.push("summary = ?"); params.push(summary); }
  if (status !== undefined) { updates.push("status = ?"); params.push(status); }

  if (updates.length > 0) {
    params.push(id);
    db.prepare(`UPDATE projects SET ${updates.join(", ")} WHERE id = ?`).run(...params);
  }
  
  res.json({ success: true });
});

app.delete("/api/projects/:id", (req, res) => {
  const { id } = req.params;
  // Get all photos for this project to delete files
  const photos = db.prepare("SELECT filename FROM photos WHERE project_id = ?").all() as { filename: string }[];
  photos.forEach(p => {
    const filePath = path.join(uploadsDir, p.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });
  db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  res.json({ success: true });
});

// API Routes - Photos
app.get("/api/photos", (req, res) => {
  const { project_id } = req.query;
  let photos;
  if (project_id) {
    photos = db.prepare("SELECT * FROM photos WHERE project_id = ? ORDER BY original_date DESC").all(project_id);
  } else {
    photos = db.prepare("SELECT * FROM photos ORDER BY original_date DESC").all();
  }
  res.json(photos);
});

app.post("/api/photos", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image uploaded" });
  }

  const { project_id, original_date, caption } = req.body;
  const filename = req.file.filename;

  const info = db.prepare(
    "INSERT INTO photos (project_id, filename, original_date, caption) VALUES (?, ?, ?, ?)"
  ).run(project_id, filename, original_date || new Date().toISOString(), caption || "");

  res.json({ id: info.lastInsertRowid, filename, caption: caption || "" });
});

app.patch("/api/photos/:id", (req, res) => {
  const { id } = req.params;
  const { caption } = req.body;
  
  db.prepare("UPDATE photos SET caption = ? WHERE id = ?").run(caption || "", id);
  res.json({ success: true });
});

app.delete("/api/photos/:id", (req, res) => {
  const { id } = req.params;
  const photo = db.prepare("SELECT filename FROM photos WHERE id = ?").get() as { filename: string } | undefined;
  
  if (photo) {
    const filePath = path.join(uploadsDir, photo.filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    db.prepare("DELETE FROM photos WHERE id = ?").run(id);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Photo not found" });
  }
});

// Backup & Restore
import AdmZip from "adm-zip";

app.get("/api/backup/export", (req, res) => {
  try {
    const zip = new AdmZip();
    zip.addLocalFile(path.join(__dirname, "tree_chronicle.db"));
    zip.addLocalFolder(uploadsDir, "uploads");
    
    const buffer = zip.toBuffer();
    res.set("Content-Type", "application/zip");
    res.set("Content-Disposition", `attachment; filename=tree_chronicle_backup_${Date.now()}.zip`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: "Export failed" });
  }
});

app.post("/api/backup/import", upload.single("backup"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No backup file" });
  
  try {
    const zip = new AdmZip(req.file.path);
    
    // Close DB connection before overwriting
    db.close();
    
    // Extract DB
    zip.extractEntryTo("tree_chronicle.db", __dirname, false, true);
    
    // Extract Uploads
    zip.extractEntryTo("uploads/", __dirname, false, true);
    
    // Reopen DB
    db = new Database("tree_chronicle.db");
    
    // Cleanup the uploaded zip
    fs.unlinkSync(req.file.path);
    
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Import failed" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
