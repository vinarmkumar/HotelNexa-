function escapeHtml(value) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
  return String(value ?? "").replace(/[&<>"']/g, (character) => entities[character]);
}

function titleCase(value) {
  return value.split("_").filter(Boolean).map((word) =>
    `${word[0].toUpperCase()}${word.slice(1)}`).join(" ");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

module.exports = function reservationCancellationEmailTemplate(guestName, reservation) {
  const [state = "", city = "", place = "", hotelFolder = ""] = reservation.hotelId.split("/");
  const hotelName = `Hotel ${titleCase(hotelFolder.replace(/^hotel_/, ""))}`;
  const cancelledByHotel = reservation.cancellationInitiatedBy === "hotelAdmin"
    || reservation.cancellationReason === "Cancelled by hotel administrator";
  const refundProcessed = reservation.refundStatus === "Processed";
  const reservationId = escapeHtml(String(reservation._id));
  const refundId = escapeHtml(reservation.refundId || "Razorpay refund reference unavailable");
  const amountPaid = reservation.amountPaid ?? reservation.amountDueNow ?? reservation.amount;

  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
  <body style="margin:0;padding:0;background:#f2f4ee;font-family:Arial,Helvetica,sans-serif;color:#171a13">
    <div style="display:none;max-height:0;overflow:hidden">${cancelledByHotel ? `${escapeHtml(hotelName)} cancelled your reservation.` : "Your HotelNexa booking was cancelled."} The amount paid was refunded.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f4ee;padding:28px 12px">
      <tr><td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #dfe3d4">
          <tr><td style="padding:26px 30px;background:#10130f;color:#f5f6ef">
            <p style="margin:0;color:#d7ff32;font-size:12px;font-weight:bold;letter-spacing:3px">HOTELNEXA</p>
            <p style="margin:24px 0 7px;color:#d7ff32;font-size:11px;font-weight:bold;letter-spacing:1.6px">${refundProcessed ? "CANCELLATION COMPLETE" : "CANCELLATION CONFIRMED · REFUND PROCESSING"} · TEST MODE</p>
            <h1 style="margin:0;font-family:Georgia,serif;font-size:32px;font-weight:400;line-height:1.15">${cancelledByHotel ? `${escapeHtml(hotelName)} cancelled your booking.` : "Your booking is cancelled."}</h1>
          </td></tr>
          <tr><td style="padding:26px 30px 12px">
            <p style="margin:0 0 8px;font-size:15px">Hello ${escapeHtml(guestName)},</p>
            <p style="margin:0;color:#5d6256;font-size:13px;line-height:1.7">${cancelledByHotel ? `${escapeHtml(hotelName)} cancelled your reservation.` : "Your reservation has been cancelled."} ${refundProcessed
    ? `The amount you paid, ${formatCurrency(amountPaid)}, has been refunded by Razorpay.`
    : `Your refund of ${formatCurrency(amountPaid)} has been initiated and is being processed by Razorpay.`}</p>
          </td></tr>
          <tr><td style="padding:16px 30px 24px">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e1e4db">
              <tr><td style="padding:17px 18px;background:#f7f8f3">
                <p style="margin:0 0 5px;color:#687054;font-size:10px;font-weight:bold;letter-spacing:1.3px">CANCELLED STAY</p>
                <h2 style="margin:0 0 5px;font-family:Georgia,serif;font-size:22px;font-weight:400">${escapeHtml(hotelName)}</h2>
                <p style="margin:0;color:#656a5d;font-size:12px">${escapeHtml([place, city, state].map(titleCase).join(", "))}, India</p>
              </td></tr>
              <tr><td style="padding:17px 18px">
                <p style="margin:0 0 12px;color:#858a7c;font-size:9px;font-weight:bold;letter-spacing:1px">STAY DATES</p>
                <p style="margin:0 0 16px;font-size:13px;font-weight:bold">${formatDate(reservation.checkIn)} – ${formatDate(reservation.checkOut)}</p>
                <p style="margin:0 0 6px;color:#858a7c;font-size:9px;font-weight:bold;letter-spacing:1px">${refundProcessed ? "AMOUNT PAID · FULLY REFUNDED" : "REFUND PROCESSING · AMOUNT PAID"}</p>
                <p style="margin:0;color:#547000;font-size:22px;font-weight:bold">${formatCurrency(amountPaid)}</p>
              </td></tr>
              <tr><td style="padding:14px 18px;border-top:1px solid #e1e4db">
                <p style="margin:0 0 7px;color:#656a5d;font-size:11px"><strong>Reservation ID:</strong> ${reservationId}</p>
                <p style="margin:0;color:#656a5d;font-size:11px"><strong>Refund reference:</strong> ${refundId}</p>
                ${reservation.cancellationReason ? `<p style="margin:7px 0 0;color:#656a5d;font-size:11px"><strong>Cancellation details:</strong> ${escapeHtml(reservation.cancellationReason)}</p>` : ""}
              </td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:16px 30px;background:#10130f;color:#aeb4a3;font-size:10px;line-height:1.6">This booking and refund used Razorpay Test Mode. No real money was charged or returned.<br>Thank you for choosing HotelNexa.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
};
