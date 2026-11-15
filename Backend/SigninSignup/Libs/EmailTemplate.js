function escapeHtml(value) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
  return String(value ?? "").replace(/[&<>"']/g, (character) => entities[character]);
}

module.exports = function emailTemplate(name, otp, purpose) {
  return `<!doctype html><html><body style="margin:0;background:#f3f5f2;font-family:Arial,sans-serif"><main style="max-width:520px;margin:32px auto;background:#fff;border:2px solid #111;padding:32px"><p style="font-size:12px;letter-spacing:3px;font-weight:bold">HOTELNEXA</p><h1 style="font-size:24px">Your stay starts here.</h1><p>Hello ${escapeHtml(name)}, use this code to ${escapeHtml(purpose)}:</p><p style="margin:24px 0;padding:18px;background:#d7ff32;text-align:center;font-size:32px;letter-spacing:10px;font-weight:bold">${escapeHtml(otp)}</p><p>This code expires in 10 minutes. Never share it with anyone.</p></main></body></html>`;
};