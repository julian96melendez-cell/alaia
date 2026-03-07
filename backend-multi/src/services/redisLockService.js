const Redis = require("ioredis");

const redis = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
});

const LOCK_PREFIX = "lock:orden:";
const DEFAULT_TTL = 30; // segundos

async function acquireLock(key, ttl = DEFAULT_TTL) {
  const result = await redis.set(
    `${LOCK_PREFIX}${key}`,
    "locked",
    "NX",
    "EX",
    ttl
  );

  return result === "OK";
}

async function releaseLock(key) {
  await redis.del(`${LOCK_PREFIX}${key}`);
}

module.exports = {
  acquireLock,
  releaseLock,
};