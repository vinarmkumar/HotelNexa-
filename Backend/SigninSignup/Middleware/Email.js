const otpTemplate = require("../Libs/EmailTemplate");
const reservationConfirmationTemplate = require("../Libs/ReservationConfirmationEmailTemplate");
const reservationCancellationTemplate = require("../Libs/ReservationCancellationEmailTemplate");

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

async function sendEmail(to, subject, htmlContent) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_USER;
  if (!apiKey || !senderEmail) throw new Error("BREVO_API_KEY and BREVO_SENDER_EMAIL (or EMAIL_USER) are required.");

  const response = await fetch(BREVO_URL, {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: { name: "HotelNexa", email: senderEmail }, to: [{ email: to }], subject, htmlContent }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const providerMessage = String(body?.message || body?.code || "").replace(/[\r\n]/g, " ").slice(0, 240);
    throw new Error(`Brevo rejected the email (HTTP ${response.status})${providerMessage ? `: ${providerMessage}` : "."}`);
  }
}

async function sendOtpEmail(email, otp, name, purpose = "verify your HotelNexa account") {
  await sendEmail(email, "Your HotelNexa verification code", otpTemplate(name, otp, purpose));
}

async function sendReservationConfirmationEmail(email, name, reservation) {
  await sendEmail(
    email,
    `Your HotelNexa booking is confirmed · ${reservation.nights} ${reservation.nights === 1 ? "night" : "nights"}`,
    reservationConfirmationTemplate(name, reservation),
  );
}

async function sendReservationCancellationEmail(email, name, reservation) {
  const initiatedByHotel = reservation.cancellationInitiatedBy === "hotelAdmin";
  await sendEmail(
    email,
    initiatedByHotel
      ? `Your hotel cancelled the booking · refund ${reservation.refundStatus?.toLowerCase() || "processing"}`
      : `HotelNexa booking cancelled · refund ${reservation.refundStatus?.toLowerCase() || "processing"}`,
    reservationCancellationTemplate(name, reservation),
  );
}

module.exports = { sendOtpEmail, sendReservationConfirmationEmail, sendReservationCancellationEmail };