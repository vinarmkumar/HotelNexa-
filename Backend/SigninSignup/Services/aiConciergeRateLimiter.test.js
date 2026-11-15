const test = require("node:test");
const assert = require("node:assert/strict");
const { createAiConciergeRateLimiter } = require("./aiConciergeRateLimiter");

test("in-memory concierge rate limit allows the configured count and resets after the window", async () => {
  let currentTime = 1_000;
  const limiter = createAiConciergeRateLimiter({
    limit: 2,
    windowMs: 60_000,
    now: () => currentTime,
  });

  assert.equal(await limiter("client-ip"), true);
  assert.equal(await limiter("client-ip"), true);
  assert.equal(await limiter("client-ip"), false);
  currentTime += 60_001;
  assert.equal(await limiter("client-ip"), true);
});

test("Redis rate limit uses an atomic script and hashes client identifiers", async () => {
  let receivedCommand;
  const redisClient = {
    isReady: true,
    async eval(script, options) {
      receivedCommand = { script, options };
      return [1, 1];
    },
  };
  const limiter = createAiConciergeRateLimiter({
    redisClient,
    limit: 20,
    windowMs: 60_000,
    now: () => 1_000,
    createRequestId: () => "request-1",
  });

  assert.equal(await limiter("203.0.113.5"), true);
  assert.match(receivedCommand.script, /ZREMRANGEBYSCORE/);
  assert.match(receivedCommand.script, /ZADD/);
  assert.match(receivedCommand.options.keys[0], /^hotelnexa:rate-limit:concierge:[a-f0-9]{64}$/);
  assert.doesNotMatch(receivedCommand.options.keys[0], /203\.0\.113\.5/);
  assert.deepEqual(receivedCommand.options.arguments, ["60000", "1000", "20", "request-1"]);
});

test("Redis rate-limit outage is not treated as an allowed request", async () => {
  const limiter = createAiConciergeRateLimiter({
    redisClient: { isReady: false },
  });
  await assert.rejects(limiter("client-ip"), /not ready/);
});
