const { Queue } = require("bullmq");
const IORedis = require("ioredis");

const connection = new IORedis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
});

const queue = new Queue("events", { connection });

async function emitEvent(name, payload, opts = {}) {
  // opts: { jobId, delay, attempts, backoff }
  return queue.add(
    name,
    { name, payload, ts: Date.now() },
    {
      removeOnComplete: 2000,
      removeOnFail: 2000,
      attempts: opts.attempts ?? 8,
      backoff: opts.backoff ?? { type: "exponential", delay: 1500 },
      delay: opts.delay ?? 0,
      jobId: opts.jobId, // 👈 idempotencia por jobId si lo defines
    }
  );
}

module.exports = { emitEvent, queue, connection };