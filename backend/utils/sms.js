// SMS sending -- currently a stub. The user has an existing ChennaiSMS
// account but hasn't provided API credentials yet, so this just logs to
// the backend's own console for now, which makes the OTP flow fully
// testable locally without a live provider. Swap the body of this one
// function for a real ChennaiSMS API call once credentials are available
// (add them to backend/.env, e.g. CHENNAISMS_API_KEY) -- nothing else in
// the OTP flow needs to change.
async function sendSms(phone, message) {
  console.log(`[SMS STUB] to ${phone}: ${message}`);
}

module.exports = { sendSms };
