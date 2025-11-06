const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const mysql = require("mysql2/promise");
const http = require("http"); // <-- THIS LINE
const { Pool } = require("pg");
const { Server } = require("socket.io"); // <-- Add this line
const multer = require("multer");
const path = require("path");
require("dotenv").config();


const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const PORT = "3001";

console.log(process.env.FRONTEND_URL);
app.use(
  cors({
    origin: "*", // 🔥 for testing, allow everything
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use((req, res, next) => {
  res.setHeader("ngrok-skip-browser-warning", "true");
  next();
});

const io = new Server(server, {
  cors: {
    origin: "*", // ya specific frontend URL daal sakte ho
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"], 
  pingInterval: 25000,  // 25 sec mein ping bheje
  pingTimeout: 60000    // 60 sec tak wait kare before disconnect
});


let connection;

// (async () => {
//   connection = await mysql.createConnection({
//     host: "localhost",
//     user: "root",
//     password: "",
//     database: "whatsappreact",
//   });
//   console.log("Connected to MySQL");
// })();

const pool = new Pool({
  user: "chat_database_qvf3_user",
  host: "dpg-d46d0c95pdvs73af5jeg-a",
  database: "chat_database_qvf3",
  password: "YOUR_PASSWORD_HERE",
  port: 5432,
  ssl: { rejectUnauthorized: false }
});

pool.connect()
  .then(() => console.log("✅ Connected to Postgres"))
  .catch(err => console.error("❌ Postgres Error: ", err));

// Serve uploaded files statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Create `uploads` directory if it doesn't exist
const fs = require("fs");
if (!fs.existsSync("./uploads")) {
  fs.mkdirSync("./uploads");
}

// Multer config for file upload
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
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB limit
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "video/mp4",
      "video/webm",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only image and video files are allowed."));
    }
  },
});

// Upload endpoint
app.post("/api/upload", upload.single("media"), (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ success: false, message: "No file uploaded" });
  }

  const fileUrl = `http://localhost:${PORT}/uploads/${req.file.filename}`;
  res.json({ success: true, fileUrl });
});

const onlineUsers = new Map(); // userId -> Set(socketIds)
const users = new Map(); // username -> socketId (for calls etc.)

io.on("connection", (socket) => {
  console.log("✅ Socket connected:", socket.id);

  // Track user connections & join room by their userId
  socket.on("userConnected", (userId) => {
    if (!userId) return;
    socket.data.userId = String(userId);
    socket.join(String(userId));
    console.log(`👤 userConnected -> userId=${userId}, socket=${socket.id}`);
  });

  // --- Messaging ---
  socket.on("sendMessage", async (message) => {
    try {
      const {
        chatId, senderId, receiverId, text,
        mediaUrl = null, type = "text", subtype = null, url = null, phoneNumber = null,
      } = message || {};

      if (!chatId || !senderId || !receiverId) {
        console.error("❌ Missing fields in message", message);
        return;
      }

      const [result] = await connection.execute(
        `INSERT INTO messages (chat_id, sender_id, receiver_id, message, type, media_url, subtype, url, phone_number)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [chatId, senderId, receiverId, text ?? null, type, mediaUrl, subtype, url, phoneNumber]
      );

      const savedMessage = { ...message, id: result.insertId };

      // Emit to receiver room and echo to sender
      io.to(String(receiverId)).emit("receiveMessage", savedMessage);
      socket.emit("receiveMessage", savedMessage);
    } catch (e) {
      console.error("❌ Failed to save/emit message:", e);
    }
  });

  // --- CALL SIGNALING (Unified names) ---
  // Caller -> Server
  // payload: { toUserId, fromUserId, offer, mediaType: "audio"|"video" }
  socket.on("call-user", ({ toUserId, fromUserId, offer, mediaType = "video" } = {}) => {
    if (!toUserId || !fromUserId || !offer) return;
    io.to(String(toUserId)).emit("receive-call", {
      fromUserId,
      offer,
      mediaType,
    });
  });

  // Callee -> Server (answer)
  // payload: { toUserId, answer }
  socket.on("answer-call", ({ toUserId, answer } = {}) => {
    if (!toUserId || !answer) return;
    io.to(String(toUserId)).emit("call-answered", { answer });
  });

  // ICE candidates
  // payload: { toUserId, candidate }
  socket.on("ice-candidate", ({ toUserId, candidate } = {}) => {
    if (!toUserId || !candidate) return;
    io.to(String(toUserId)).emit("ice-candidate", { candidate });
  });

  // Reject call
  // payload: { toUserId, reason }
  socket.on("reject-call", ({ toUserId, reason = "rejected" } = {}) => {
    if (!toUserId) return;
    io.to(String(toUserId)).emit("call-rejected", { reason });
  });

  // End call
  // payload: { toUserId }
  socket.on("end-call", ({ toUserId } = {}) => {
    if (!toUserId) return;
    io.to(String(toUserId)).emit("call-ended");
  });

  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected:", socket.id);
  });
});

app.post("/api/upload", upload.single("media"), (req, res) => {
  const filePath = `/uploads/${req.file.filename}`;
  res.json({ url: filePath });
});

// Register endpoint
app.post("/api/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).send("All fields are required");

  try {
    // Check if user already exists
    const [existing] = await pool.query(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );
    if (existing.length > 0)
      return res.status(409).send("Email already in use");

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
      [name, email, hashedPassword]
    );
    res.status(201).send("User registered successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

//Login Endpoint
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).send("Email and password are required");

  try {
    const [rows] = await pool.query(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    if (rows.length === 0) return res.status(401).send("User not found");

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) return res.status(401).send("Incorrect password");

    // Success - send user data (you can send token or id)
    res.status(200).json({
      message: "Login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// get user endpoint
app.get("/api/users", async (req, res) => {
  try {
    const [users] = await pool.query("SELECT id, name, email FROM users");
    console.log(users);
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

app.get("/api/messages/:user1/:user2", async (req, res) => {
  const { user1, user2 } = req.params;

  try {
    const [messages] = await pool.query(
      `SELECT * FROM messages 
       WHERE (sender_id = ? AND receiver_id = ?) 
          OR (sender_id = ? AND receiver_id = ?)
       ORDER BY created_at ASC`,
      [user1, user2, user2, user1]
    );

    res.json(messages);
  } catch (error) {
    console.error(error);
    res.status(500).send("Server error");
  }
});

// async function updateEnv() {
//   try {
//     const res = await axios.get("http://127.0.0.1:4040/api/tunnels");
//     const tunnels = res.data.tunnels;

//     let backendUrl = "";
//     let frontendUrl = "";

//     tunnels.forEach((t) => {
//       if (t.config.addr.includes("3001")) backendUrl = t.public_url;
//       if (t.config.addr.includes("3000")) frontendUrl = t.public_url;
//     });

//     const envContent = `
// REACT_APP_API_URL=${backendUrl}
// FRONTEND_URL=${frontendUrl}
// `;

//     fs.writeFileSync("./.env", envContent.trim());
//     console.log("✅ .env updated successfully");
//     console.log(envContent);
//   } catch (err) {
//     console.error("Error fetching ngrok tunnels:", err.message);
//   }
// }

// updateEnv();
// Replace app.listen(...) with:

// const path = require("path");


// app.use(express.static(path.join(__dirname, "build")));

// app.get("*", (req, res) => {
//   res.sendFile(path.join(__dirname, "build", "index.html"));
// });

server.listen(3001, () => {
  console.log("Server running on http://localhost:3001");
});
