function validateDeploymentConfig(environment = process.env) {
  if (environment.NODE_ENV !== "production") return;

  if (environment.PAYMENT_MODE !== "test") {
    throw new Error("Production QA requires PAYMENT_MODE=test. Live payments are not supported.");
  }

  const requiredVariables = [
    "MONGO_URI",
    "JWT_SECRET",
    "FRONTEND_ORIGINS",
    "BREVO_API_KEY",
    "BREVO_SENDER_EMAIL",
    "GOOGLE_CLIENT_ID",
    "GEMINI_API_KEY",
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
  ];
  const missingVariables = requiredVariables.filter((name) => !environment[name]?.trim());
  if (missingVariables.length) {
    throw new Error(`Missing production environment variables: ${missingVariables.join(", ")}.`);
  }
  if (environment.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters.");
  }
  if (!environment.RAZORPAY_KEY_ID.startsWith("rzp_test_")) {
    throw new Error("Production QA requires a Razorpay Test Mode key ID.");
  }
}

module.exports = { validateDeploymentConfig };
