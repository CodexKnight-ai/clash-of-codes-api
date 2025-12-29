import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import http from "http";
import ws from "ws";

import { auth, authToCookie, verifyEnv } from "./src/util/middlewares";
import {
  connectToRedis,
  getNewRedisClient,
  getRedisClient,
} from "./src/util/redis";
import { connectToDatabase, getClient } from "./src/util/db";
import router from "./src/routes";
import {
  syncData,
  syncLeaderboardFromCF,
} from "./src/util/functions";

/* =======================
   CONFIG
======================= */

const PORT = Number(process.env.PORT) || 3001;

const corsOptions = {
  origin: [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://clash-of-codes2026.vercel.app",
    "https://clash-of-codes-api-0p6t.onrender.com",
  ],
  credentials: true,
  optionSuccessStatus: 200,
};

/* =======================
   APP SETUP
======================= */

const app = express();
const server = http.createServer(app);
const wss = new ws.Server({ server });

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

/* =======================
   AUTH MIDDLEWARES
======================= */

// Make sure these DO NOT block OPTIONS requests internally
app.use(authToCookie);
app.use(auth);

/* =======================
   ROUTES
======================= */

app.post("/logout", (req, res) => {
  res.clearCookie("server_token", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
  });

  res.clearCookie("google_token", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
  });

  res.status(200).json({ success: true });
});

app.use("/", router);

/* =======================
   REDIS + WEBSOCKETS
======================= */

const redisSubscriber = getNewRedisClient();

(async () => {
  await redisSubscriber.connect();
  await redisSubscriber.subscribe("configHash", async () => {
    await syncData();
  });
})();

wss.on("connection", async (socket) => {
  console.log("WebSocket connected");

  const cachedData = await getRedisClient().get("leaderboard");
  if (cachedData) socket.send(cachedData);

  redisSubscriber.subscribe("live", (message) => {
    socket.send(message);
  });

  socket.on("close", () => {
    console.log("WebSocket disconnected");
  });
});

/* =======================
   STARTUP SEQUENCE
======================= */

const client = getClient();

client.on("open", async () => {
  verifyEnv();

  setInterval(async () => {
    await syncLeaderboardFromCF();
  }, 13000);

  server.listen(PORT, () => {
    console.log(`🚀 API running on port ${PORT}`);
  });
});

/* =======================
   GRACEFUL SHUTDOWN
======================= */

process.on("SIGTERM", async () => {
  console.log("SIGTERM received. Shutting down...");
  await redisSubscriber.quit();
  await client.close();
  process.exit(0);
});
