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

module.exports = function reservationConfirmationEmailTemplate(guestName, reservation) {
  const [, state = "", city = "", place = "", hotelFolder = ""] = reservation.hotelId.split("/");
  const hotelName = `Hotel ${titleCase(hotelFolder.replace(/^hotel_/, ""))}`;
  const guestCount = reservation.adults + reservation.childAges.length;
  const totalAmount = reservation.totalAmount ?? reservation.amount;
  const amountPaid = reservation.amountPaid ?? reservation.amountDueNow ?? reservation.amount;
  const balanceDue = reservation.balanceDue ?? Math.max(0, totalAmount - amountPaid);
  const paymentType = reservation.paymentType || "Full";
  const children = reservation.childAges.length
    ? ` · ${reservation.childAges.length} ${reservation.childAges.length === 1 ? "child" : "children"}`
    : "";
  const bookingDate = new Date(reservation.checkIn).toISOString().slice(0, 10);
  const reservationCode = escapeHtml(String(reservation._id));

  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
  <body style="margin:0;padding:0;background:#f2f4ee;font-family:Arial,Helvetica,sans-serif;color:#171a13">
    <div style="display:none;max-height:0;overflow:hidden">Your HotelNexa test booking is confirmed. Your reservation details are inside.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f4ee;padding:28px 12px">
      <tr><td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #dfe3d4">
          <tr><td style="padding:26px 30px;background:#10130f;color:#f5f6ef">
            <p style="margin:0;color:#d7ff32;font-size:12px;font-weight:bold;letter-spacing:3px">HOTELNEXA</p>
            <p style="margin:24px 0 7px;color:#d7ff32;font-size:11px;font-weight:bold;letter-spacing:1.6px">BOOKING CONFIRMED · TEST MODE</p>
            <h1 style="margin:0;font-family:Georgia,serif;font-size:32px;font-weight:400;line-height:1.15">Your next stay is<br>on the calendar.</h1>
          </td></tr>
          <tr><td style="padding:26px 30px 10px">
            <p style="margin:0 0 8px;font-size:15px">Hello ${escapeHtml(guestName)},</p>
            <p style="margin:0;color:#5d6256;font-size:13px;line-height:1.7">Your payment was verified and your HotelNexa reservation is confirmed. Keep this email for your booking details and remaining balance.</p>
          </td></tr>
          <tr><td style="padding:16px 30px">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e1e4db">
              <tr><td style="padding:17px 18px;background:#f7f8f3">
                <p style="margin:0 0 5px;color:#687054;font-size:10px;font-weight:bold;letter-spacing:1.3px">YOUR HOTEL</p>
                <h2 style="margin:0 0 5px;font-family:Georgia,serif;font-size:22px;font-weight:400">${escapeHtml(hotelName)}</h2>
                <p style="margin:0;color:#656a5d;font-size:12px">${escapeHtml([place, city, state].map(titleCase).join(", "))}, India</p>
              </td></tr>
              <tr><td style="padding:17px 18px">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td width="50%" valign="top" style="padding:0 8px 17px 0"><p style="margin:0 0 6px;color:#858a7c;font-size:9px;font-weight:bold;letter-spacing:1px">CHECK-IN</p><p style="margin:0;font-size:13px;font-weight:bold">${formatDate(reservation.checkIn)}</p></td>
                    <td width="50%" valign="top" style="padding:0 0 17px 8px"><p style="margin:0 0 6px;color:#858a7c;font-size:9px;font-weight:bold;letter-spacing:1px">CHECK-OUT</p><p style="margin:0;font-size:13px;font-weight:bold">${formatDate(reservation.checkOut)}</p></td>
                  </tr>
                  <tr>
                    <td width="50%" valign="top" style="padding:0 8px 0 0"><p style="margin:0 0 6px;color:#858a7c;font-size:9px;font-weight:bold;letter-spacing:1px">ROOM</p><p style="margin:0;font-size:13px;font-weight:bold">${reservation.bedCount} ${reservation.bedCount === 1 ? "bed" : "beds"} · 1 room</p></td>
                    <td width="50%" valign="top" style="padding:0 0 0 8px"><p style="margin:0 0 6px;color:#858a7c;font-size:9px;font-weight:bold;letter-spacing:1px">GUESTS & DURATION</p><p style="margin:0;font-size:13px;font-weight:bold">${guestCount} ${guestCount === 1 ? "guest" : "guests"}${children} · ${reservation.nights} ${reservation.nights === 1 ? "night" : "nights"}</p></td>
                  </tr>
                </table>
              </td></tr>
              <tr><td style="padding:15px 18px;border-top:1px solid #e1e4db">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr><td style="padding:4px 0;color:#656a5d;font-size:12px">Nightly rate × ${reservation.nights} ${reservation.nights === 1 ? "night" : "nights"}</td><td align="right" style="padding:4px 0;color:#171a13;font-size:12px">${formatCurrency(reservation.nightlyRate)} × ${reservation.nights}</td></tr>
                  <tr><td style="padding:7px 0;color:#656a5d;font-size:12px">Full stay total</td><td align="right" style="padding:7px 0;color:#171a13;font-size:12px;font-weight:bold">${formatCurrency(totalAmount)}</td></tr>
                  <tr><td style="padding:7px 0;color:#171a13;font-size:12px;font-weight:bold">Paid now · ${escapeHtml(paymentType)} payment</td><td align="right" style="padding:7px 0;color:#547000;font-size:16px;font-weight:bold">${formatCurrency(amountPaid)}</td></tr>
                  <tr><td style="padding:7px 0;color:#656a5d;font-size:12px">Remaining balance due later</td><td align="right" style="padding:7px 0;color:#171a13;font-size:13px;font-weight:bold">${formatCurrency(balanceDue)}</td></tr>
                </table>
              </td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:8px 30px 24px">
            <p style="margin:0 0 8px;color:#5d6256;font-size:11px"><strong>Reservation ID:</strong> ${reservationCode}</p>
            <p style="margin:0;color:#73786b;font-size:10px;line-height:1.6">This booking uses illustrative HotelNexa demo inventory. The payment was made in Razorpay Test Mode and no real money was charged. Please confirm actual property details directly with the hotel before travel.</p>
          </td></tr>
          <tr><td style="padding:16px 30px;background:#10130f;color:#aeb4a3;font-size:10px;line-height:1.6">Thank you for booking with HotelNexa.<br>Stay different · Find your next story</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
};
