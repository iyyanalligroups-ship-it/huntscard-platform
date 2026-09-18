const nodemailer = require('nodemailer');

// Zoho Mail SMTP -- built lazily (not at require-time) so a missing
// APP_EMAIL/APP_PASSWORD during local dev doesn't crash the whole server on
// boot, same reasoning as getRazorpay() in routes/profile.js.
let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.APP_EMAIL || !process.env.APP_PASSWORD) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.zoho.in',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: true,
    auth: {
      user: process.env.APP_EMAIL,
      pass: process.env.APP_PASSWORD,
    },
  });
  return transporter;
}

async function sendEmail(to, subject, body) {
  const t = getTransporter();
  if (!t) {
    console.log(`[EMAIL STUB -- APP_EMAIL/APP_PASSWORD not set] to ${to} | subject: ${subject}\n${body}`);
    return;
  }
  try {
    await t.sendMail({ from: `huntsTAG <${process.env.APP_EMAIL}>`, to, subject, text: body });
    console.log(`[EMAIL] sent to ${to}: ${subject}`);
  } catch (err) {
    console.error(`[EMAIL] failed to send to ${to}:`, err.message);
  }
}

module.exports = { sendEmail };
