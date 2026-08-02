// SMS sending via ChennaiSMS's HTTP API (GET request, credentials + message
// as query params, plain-text response body -- no SDK, this is their whole
// integration surface). Errors are logged but never thrown: an OTP the
// client never receives just means they'll hit "Incorrect code"/ask for a
// new one, which is a much better failure mode than a 500 on login.
const CHENNAISMS_BASE_URL = 'https://online.chennaisms.com/api/mt/SendSMS';

async function sendSms(phone, message) {
  const params = new URLSearchParams({
    user: process.env.CHENNAISMS_USER,
    password: process.env.CHENNAISMS_PASSWORD,
    senderid: process.env.CHENNAISMS_SENDERID,
    channel: 'Trans',
    DCS: '0',
    flashsms: '0',
    number: phone,
    text: message,
  });

  try {
    const res = await fetch(`${CHENNAISMS_BASE_URL}?${params.toString()}`);
    const body = await res.text();
    if (!res.ok) {
      console.error(`[SMS] ChennaiSMS request failed (${res.status}) for ${phone}:`, body);
      return;
    }
    // ChennaiSMS returns 200 with an error code/message in the body text
    // itself even on failure (bad credentials, insufficient balance, etc.)
    // -- not a thrown/HTTP-level error, so log it either way for now.
    console.log(`[SMS] sent to ${phone}:`, body);
  } catch (err) {
    console.error(`[SMS] failed to send to ${phone}:`, err.message);
  }
}

module.exports = { sendSms };
