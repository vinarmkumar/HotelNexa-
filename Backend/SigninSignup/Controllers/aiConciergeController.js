const {
  interpretConciergeMessage,
  searchAvailableHotels,
} = require("../Services/aiConciergeService");
const { isAiConciergeRequestAllowed } = require("../Services/aiConciergeRateLimiter");

async function applyRateLimit(req, res) {
  const client = req.ip || req.socket.remoteAddress || "unknown";
  try {
    if (await isAiConciergeRequestAllowed(client)) return null;
    return res.status(429).json({
      success: false,
      message: "Too many concierge requests. Please wait a minute and try again.",
    });
  } catch (error) {
    console.error("AI Concierge rate limiting is unavailable.");
    return res.status(503).json({
      success: false,
      message: "The AI concierge is temporarily unavailable. Please try again shortly.",
    });
  }
}

exports.interpret = async (req, res) => {
  const limited = await applyRateLimit(req, res);
  if (limited) return limited;
  try {
    const preferences = await interpretConciergeMessage(req.body?.message);
    return res.json({ success: true, preferences });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error("Concierge intent interpretation failed:", error.message);
    return res.status(502).json({ success: false, message: "The AI concierge could not process your request." });
  }
};

exports.search = async (req, res) => {
  const limited = await applyRateLimit(req, res);
  if (limited) return limited;
  try {
    const result = await searchAvailableHotels(req.body);
    return res.json({ success: true, ...result });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error("Concierge hotel search failed:", error.message);
    return res.status(500).json({ success: false, message: "Available hotel search could not be completed." });
  }
};
