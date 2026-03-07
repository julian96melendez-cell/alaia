const IORedis = require("ioredis");

function getRedisConnection() {
  const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  return new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

module.exports = { getRedisConnection };