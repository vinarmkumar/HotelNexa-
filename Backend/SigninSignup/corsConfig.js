const localOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];

function getAllowedOrigins() {
  const configured = process.env.FRONTEND_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (configured?.length) return configured;
  return process.env.NODE_ENV === "production" ? [] : localOrigins;
}

function validateFrontendOrigins() {
  const origins = getAllowedOrigins();
  if (!origins.length) throw new Error("Set FRONTEND_ORIGINS to the frontend origin.");
  for (const origin of origins) {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error("FRONTEND_ORIGINS must contain valid origins.");
    }
    if (parsed.origin !== origin || (process.env.NODE_ENV === "production" && parsed.protocol !== "https:")) {
      throw new Error("Use exact frontend origins, and HTTPS in production.");
    }
  }
}

function corsOrigin(origin, callback) {
  callback(null, !origin || getAllowedOrigins().includes(origin));
}

module.exports = { corsOrigin, validateFrontendOrigins };