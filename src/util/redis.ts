import { createClient } from 'redis';

const REDIS_CONFIG = {
    username: 'default',
    password: process.env.REDIS_PASS,
    socket: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT),
        connectTimeout: 10000,
    }
};

const client = createClient(REDIS_CONFIG);

// 1. GLOBAL ERROR LISTENER
// This is the most important part to prevent [nodemon] app crashed
client.on('error', err => {
    console.error('Core Redis Client Error:', err.message);
});

export async function connectToRedis() {
    try {
        if (!client.isOpen) {
            console.log("Attempting to connect to Redis...");
            await client.connect();
            console.log("✅ Redis connected successfully");
        }
    } catch (err: any) {
        // Catching the initial connection timeout
        console.error("❌ Redis Initial Connection Timeout:", err.message);
        console.error("Check if your IP is whitelisted in Redis Cloud console.");
    }
}

// Ensure connection is called
connectToRedis();

export function getRedisClient() {
    return client;
}

/**
 * Creates a new client with its own error handling to prevent crashes
 */
export function getNewRedisClient() {
    const newClient = createClient(REDIS_CONFIG);
    
    // EVERY new client must have its own error listener
    newClient.on('error', err => {
        console.error('New Instance Redis Client Error:', err.message);
    });

    return newClient;
}