/***************************************************************
 * server.js
 * Full backend for chat-app (Express + Socket.io + Postgres)
 * - Converted from MySQL to PostgreSQL
 * - Preserves all features: uploads, sockets, call signaling,
 *   register/login, messages APIs, serve react build, etc.
 * - Render-ready (uses process.env.PORT and binds 0.0.0.0)
 ***************************************************************/

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const { Pool } = require("pg");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
require("dotenv").config();
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

// --- Basic Crash Logging (helps Render logs)
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
});

// --- Create uploads folder if not exists
if (!fs.existsSync("./uploads")) {
  fs.mkdirSync("./uploads");
}

// --- HTTP server + Socket.io
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // for testing; prefer a specific FRONTEND_URL in production
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"],
  pingInterval: 25000,
  pingTimeout: 60000
});

// --- Postgres pool config
// You confirmed this password; better to set DATABASE_URL as env on Render.
// Example env var: postgres://user:password@host:5432/dbname
const pool = new Pool({
  user: "chat_database_qvf3_user",
  host: "dpg-d46d0c95pdvs73af5jeg-a.oregon-postgres.render.com",
  database: "chat_database_qvf3",
  password: "B8yh59lzYVIZIsX3lnFItjFAG5FH48X4",
  port: 5432,
  ssl: { rejectUnauthorized: false }
});

pool.connect()
  .then(() => console.log("✅ Connected to Postgres"))
  .catch(err => console.error("❌ Postgres Error:", err));

// ----------------- Multer (upload) -----------------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "video/mp4",
      "video/webm",
      "audio/mpeg",
      "audio/mp3"
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only image/video/audio files are allowed."));
  },
});

// Helper to build file URL (works both on local & Render)
function buildFileUrl(req, filePath) {
  // prefer FRONTEND_URL if provided (but typically use server host)
  const host = process.env.FRONTEND_URL || `${req.protocol}://${req.get("host")}`;
  return `${host}${filePath.startsWith("/") ? "" : "/"}${filePath}`;
}

// ----------------- Routes -----------------

// Simple ping
app.get("/api/ping", (req, res) => res.json({ ok: true, time: new Date() }));

// Upload endpoint (single)
app.post("/api/upload", upload.single("media"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
    const filePath = `/uploads/${req.file.filename}`;
    const fileUrl = buildFileUrl(req, filePath); // note: Frontend should fetch from same origin
    return res.json({ success: true, url: fileUrl, path: filePath });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ success: false, message: "Upload failed" });
  }
});

// Serve uploaded files statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ----------------- Authentication (Register / Login) -----------------

app.post("/api/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).send("All fields are required");

  try {
    const check = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (check.rows.length > 0) return res.status(409).send("Email already in use");

    const hashedPassword = await bcrypt.hash(password, 10);

    const insert = await pool.query(
      "INSERT INTO users (name, email, password, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id, name, email",
      [name, email, hashedPassword]
    );

    const user = insert.rows[0];
    return res.status(201).json({ message: "User registered successfully", user });

  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).send("Server error");
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).send("Email and password are required");

  try {
    const result = await pool.query("SELECT id, name, email, password FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) return res.status(401).send("User not found");

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).send("Incorrect password");

    // Return user info (you can return JWT token instead)
    return res.status(200).json({
      message: "Login successful",
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).send("Server error");
  }
});

// ----------------- Basic data endpoints -----------------
app.get("/api/users", async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name, email FROM users ORDER BY id ASC");
    return res.json(result.rows);
  } catch (err) {
    console.error("Get users error:", err);
    return res.status(500).send("Server error");
  }
});

// Get messages between two users (1-to-1)
app.get("/api/messages/:user1/:user2", async (req, res) => {
  const { user1, user2 } = req.params;
  try {
    const result = await pool.query(
      `SELECT * FROM messages
       WHERE (sender_id = $1 AND receiver_id = $2)
          OR (sender_id = $2 AND receiver_id = $1)
       ORDER BY created_at ASC`,
      [user1, user2]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error("Get messages error:", err);
    return res.status(500).send("Server error");
  }
});

// ----------------- Socket.io — messaging & call signaling -----------------

/*
Socket flow preserved:
- userConnected -> join a room with userId
- sendMessage -> save message to messages table (Postgres) and emit to receiver room
- call-user, answer-call, ice-candidate, reject-call, end-call -> relay events to target user
*/

io.on("connection", (socket) => {
  console.log("✅ Socket connected:", socket.id);

  // userConnected: client should send their userId after connecting
  socket.on("userConnected", (userId) => {
    if (!userId) return;
    socket.data.userId = String(userId);
    socket.join(String(userId));
    console.log(`👤 userConnected -> userId=${userId}, socket=${socket.id}`);
  });

  // sendMessage (from client)
  // message object expected:
  // { chatId, senderId, receiverId, text, mediaUrl, type, subtype, url, phoneNumber }
  socket.on("sendMessage", async (message = {}) => {
    try {
      const {
        chatId, senderId, receiverId, text,
        mediaUrl = null, type = "text", subtype = null, url = null, phoneNumber = null,
      } = message;

      if (!chatId || !senderId || !receiverId) {
        console.error("❌ Missing fields in message", message);
        return;
      }

      const insertQuery = `
        INSERT INTO messages 
        (chat_id, sender_id, receiver_id, message, type, media_url, subtype, url, phone_number, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
        RETURNING id, created_at
      `;
      const values = [chatId, senderId, receiverId, text ?? null, type, mediaUrl, subtype, url, phoneNumber];

      const resInsert = await pool.query(insertQuery, values);
      const savedId = resInsert.rows[0].id;
      const createdAt = resInsert.rows[0].created_at;

      const savedMessage = { ...message, id: savedId, created_at: createdAt };

      // Emit message to receiver room and to sender (echo)
      io.to(String(receiverId)).emit("receiveMessage", savedMessage);
      socket.emit("receiveMessage", savedMessage);

    } catch (err) {
      console.error("❌ Failed to save/emit message:", err);
    }
  });

  // CALL SIGNALING
  socket.on("call-user", ({ toUserId, fromUserId, offer, mediaType = "video" } = {}) => {
    if (!toUserId || !fromUserId || !offer) return;
    io.to(String(toUserId)).emit("receive-call", { fromUserId, offer, mediaType });
  });

  socket.on("answer-call", ({ toUserId, answer } = {}) => {
    if (!toUserId || !answer) return;
    io.to(String(toUserId)).emit("call-answered", { answer });
  });

  socket.on("ice-candidate", ({ toUserId, candidate } = {}) => {
    if (!toUserId || !candidate) return;
    io.to(String(toUserId)).emit("ice-candidate", { candidate });
  });

  socket.on("reject-call", ({ toUserId, reason = "rejected" } = {}) => {
    if (!toUserId) return;
    io.to(String(toUserId)).emit("call-rejected", { reason });
  });

  socket.on("end-call", ({ toUserId } = {}) => {
    if (!toUserId) return;
    io.to(String(toUserId)).emit("call-ended");
  });

  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected:", socket.id);
  });
});

// ----------------- Serve React Build (SPA) -----------------
app.use(express.static(path.join(__dirname, "build")));

// For SPA client-side routing, return index.html for any unknown GET route
// Using "/*" or "*" both fine for Express 4; this app uses Express 4 compatible patterns.
app.get("/*", (req, res) => {
  res.sendFile(path.join(__dirname, "build", "index.html"));
});

// ----------------- Start server (Render-ready) -----------------
const PORT = process.env.PORT || 10000;

// Bind to 0.0.0.0 so Render can route traffic
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});
