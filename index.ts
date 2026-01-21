import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import http from "http";
import ws from "ws";

import { auth, authToCookie, verifyEnv } from "./src/util/middlewares";
import { connectToRedis, getNewRedisClient, getRedisClient } from "./src/util/redis";
import { connectToDatabase, getClient } from "./src/util/db";
import router from "./src/routes";
import { syncData, syncLeaderboardFromCF } from "./src/util/functions";

const app = express();
// Render sets process.env.PORT automatically. Do not hardcode 3001 in Render Dashboard.
const PORT = process.env.PORT || 3001;

const corsOptions = {
  origin: ["http://localhost:3000", "https://clash-of-codes2026.vercel.app","https://lb.pclub.online"],
  credentials: true,  // This is required for credentials
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// 1. GLOBAL MIDDLEWARE
// Always put CORS first so it handles OPTIONS requests before Auth kicks in
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// 2. AUTH & ROUTES
app.use(authToCookie);

app.use(auth);

app.post("/logout", (req, res) => {
  res.clearCookie("server_token", {
    httpOnly: true,
    secure: true,
    sameSite: "none", 
    path: "/"
  });
  res.clearCookie("google_token",{
    httpOnly: true,
    secure: true,
    sameSite: "none", 
    path: "/"
  });
  res.status(200).json({ success: true });
});

app.use("/", router);

// 3. SERVER & WEBSOCKETS
const server = http.createServer(app);
const wss = new ws.Server({ server });

// 4. DATABASE & REDIS STARTUP
// We start the server immediately so Render detects the open port,
// then we handle the connections.
server.listen(PORT, async () => {
  console.log(`🚀 Server binding successful on port ${PORT}`);

  try {
    await connectToDatabase();
    await connectToRedis();
    verifyEnv();

    const redisClient2 = getNewRedisClient();
    await redisClient2.connect();

    redisClient2.subscribe("configHash", async () => {
      await syncData();
    });

    wss.on("connection", async (socket) => {
      const cachedData = await getRedisClient().get("leaderboard");
      if (cachedData) socket.send(cachedData);

      redisClient2.subscribe("live", (message) => {
        socket.send(message);
      });
    });

    setInterval(syncLeaderboardFromCF, 13000);
    console.log("✅ All systems connected (DB, Redis, WS)");
  } catch (err) {
    console.error("❌ Startup Error:", err);
  }
});