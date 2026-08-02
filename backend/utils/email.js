// Email sending -- currently a stub, mirroring utils/sms.js exactly. No
// real provider (SMTP/SendGrid/etc) is wired up yet, so this just logs to
// the backend's own console for now, which makes the reset-link flow fully
// testable locally without live credentials. Swap the body of this one
// function for a real provider call once credentials are available --
// nothing else in the reset flow needs to change.
async function sendEmail(to, subject, body) {
  console.log(`[EMAIL STUB] to ${to} | subject: ${subject}\n${body}`);
}

module.exports = { sendEmail };
