const crypto = require("node:crypto");
const { createClient } = require("redis");

const WINDOW_MS = 60_000;
const REQUEST_LIMIT = 20;
const RATE_LIMIT_SCRIPT = `
local windowMs = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call("ZREMRANGEBYSCORE", KEYS[1], 0, now - windowMs)
local count = redis.call("ZCARD", KEYS[1])
if count >= limit then
  return {0, count}
end
redis.call("ZADD", KEYS[1], now, ARGV[4])
redis.call("PEXPIRE", KEYS[1], windowMs)
return {1, count + 1}
`;

function createAiConciergeRateLimiter({
  redisClient,
  limit = REQUEST_LIMIT,
  windowMs = WINDOW_MS,
  now = Date.now,
  createRequestId = crypto.randomUUID,
} = {}) {
  const requestsByClient = new Map();

  return async function isAllowed(identifier) {
    const clientHash = crypto.createHash("sha256")
      .update(String(identifier || "unknown"))
      .digest("hex");

    if (redisClient) {
      if (!redisClient.isReady) {
        throw new Error("Redis rate-limit store is not ready.");
      }
      const result = await redisClient.eval(RATE_LIMIT_SCRIPT, {
        keys: [`hotelnexa:rate-limit:concierge:${clientHash}`],
        arguments: [
          String(windowMs),
          String(now()),
          String(limit),
          createRequestId(),
        ],
      });
      return Number(result[0]) === 1;
    }

    const currentTime = now();
    const recentRequests = (requestsByClient.get(clientHash) || [])
      .filter((timestamp) => currentTime - timestamp < windowMs);
    if (recentRequests.length >= limit) {
      requestsByClient.set(clientHash, recentRequests);
      return false;
    }
    recentRequests.push(currentTime);
    requestsByClient.set(clientHash, recentRequests);
    return true;
  };
}

let isAllowed;

async function initializeAiConciergeRateLimiter() {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("REDIS_URL is required in production.");
    }
    isAllowed = createAiConciergeRateLimiter();
    console.warn("REDIS_URL is not set; AI Concierge rate limits are local to this process.");
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(redisUrl);
  } catch {
    throw new Error("REDIS_URL must be a valid Redis connection URL.");
  }
  if (!["redis:", "rediss:"].includes(parsedUrl.protocol)) {
    throw new Error("REDIS_URL must use the redis:// or rediss:// protocol.");
  }
  const useTls = parsedUrl.protocol === "rediss:"
    || process.env.REDIS_TLS?.toLowerCase() === "true";
  if (process.env.NODE_ENV === "production" && !useTls) {
    throw new Error("Production Redis connections must use TLS. Set REDIS_TLS=true when REDIS_URL starts with redis://.");
  }
  if (useTls && parsedUrl.protocol === "redis:") {
    parsedUrl.protocol = "rediss:";
  }

  let client;
  try {
    client = createClient({ url: parsedUrl.toString() });
    client.on("error", () => {
      console.error("Redis rate-limit connection error.");
    });
    await client.connect();
  } catch {
    if (client?.isOpen) await client.disconnect();
    throw new Error("Could not connect to the Redis rate-limit store. Check REDIS_URL, credentials, and TLS configuration.");
  }
  isAllowed = createAiConciergeRateLimiter({ redisClient: client });
  console.log("Redis connected; AI Concierge rate limits are shared.");
}

async function isAiConciergeRequestAllowed(identifier) {
  if (!isAllowed) {
    throw new Error("AI Concierge rate limiter has not been initialized.");
  }
  return isAllowed(identifier);
}

module.exports = {
  createAiConciergeRateLimiter,
  initializeAiConciergeRateLimiter,
  isAiConciergeRequestAllowed,
};
