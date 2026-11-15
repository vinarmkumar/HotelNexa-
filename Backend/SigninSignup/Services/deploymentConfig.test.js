const test = require("node:test");
const assert = require("node:assert/strict");
const { getCredentials } = require("./razorpayService");
const { validateDeploymentConfig } = require("../deploymentConfig");

test("production hosting is permitted only with explicit Test Mode", () => {
  const completeProductionConfig = {
    NODE_ENV: "production",
    PAYMENT_MODE: "test",
    MONGO_URI: "mongodb://database",
    JWT_SECRET: "a".repeat(32),
    FRONTEND_ORIGINS: "https://hotelnexa.example",
    BREVO_API_KEY: "brevo-test-key",
    BREVO_SENDER_EMAIL: "verified@example.com",
    GOOGLE_CLIENT_ID: "google-client.apps.googleusercontent.com",
    GEMINI_API_KEY: "gemini-test-key",
    RAZORPAY_KEY_ID: "rzp_test_demo",
    RAZORPAY_KEY_SECRET: "razorpay-test-secret",
    REDIS_URL: "redis://default:redis-test-secret@redis.example.com:6379",
    REDIS_TLS: "true",
  };
  assert.doesNotThrow(() => validateDeploymentConfig(completeProductionConfig));
  assert.throws(() => validateDeploymentConfig({ NODE_ENV: "production" }), /PAYMENT_MODE=test/);
  assert.throws(() => validateDeploymentConfig({
    NODE_ENV: "production",
    PAYMENT_MODE: "live",
  }), /PAYMENT_MODE=test/);
  assert.doesNotThrow(() => validateDeploymentConfig({ NODE_ENV: "development" }));
  assert.throws(() => validateDeploymentConfig({
    ...completeProductionConfig,
    GEMINI_API_KEY: "",
  }), /GEMINI_API_KEY/);
  assert.throws(() => validateDeploymentConfig({
    ...completeProductionConfig,
    RAZORPAY_KEY_ID: "rzp_live_not-allowed",
  }), /Test Mode key/);
  assert.throws(() => validateDeploymentConfig({
    ...completeProductionConfig,
    REDIS_TLS: "false",
  }), /must use TLS/);
});

test("Razorpay accepts only test credentials and rejects live mode", () => {
  const originalEnvironment = {
    PAYMENT_MODE: process.env.PAYMENT_MODE,
    RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
    RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
  };
  try {
    process.env.PAYMENT_MODE = "test";
    process.env.RAZORPAY_KEY_ID = "rzp_test_demo";
    process.env.RAZORPAY_KEY_SECRET = "demo-secret";
    assert.deepEqual(getCredentials(), {
      keyId: "rzp_test_demo",
      keySecret: "demo-secret",
    });

    process.env.PAYMENT_MODE = "live";
    assert.throws(getCredentials, /Razorpay test mode is not configured/);
  } finally {
    for (const [key, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
