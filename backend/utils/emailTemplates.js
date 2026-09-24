function passwordResetEmail(otp) {
  const code = String(otp);
  const text = [
    'Reset your HunsTAG password',
    '',
    `Your verification code is: ${code}`,
    '',
    'This code expires in 10 minutes and can only be used once.',
    "If you didn't request a password reset, you can safely ignore this email.",
    '',
    'HunsTAG Security',
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Reset your HunsTAG password</title>
    <style>
      @media only screen and (max-width: 600px) {
        .email-shell { padding: 20px 12px !important; }
        .email-card { border-radius: 18px !important; }
        .email-body { padding: 30px 22px 24px !important; }
        .otp-code { font-size: 30px !important; letter-spacing: 8px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#f4f6f8;color:#2f2b3d;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      Use ${code} to reset your HunsTAG password. This code expires in 10 minutes.
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f6f8;">
      <tr>
        <td class="email-shell" align="center" style="padding:42px 16px;">
          <table class="email-card" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #e2e4e9;border-radius:24px;overflow:hidden;box-shadow:0 16px 42px rgba(47,43,61,.10);">
            <tr>
              <td style="height:7px;background:#0d9fa3;background-image:linear-gradient(90deg,#0d9fa3,#26b7b2,#7367f0);"></td>
            </tr>
            <tr>
              <td class="email-body" style="padding:38px 42px 30px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="padding-bottom:30px;">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td align="center" valign="middle" style="width:48px;height:48px;border-radius:14px;background:#0d9fa3;color:#ffffff;font-size:21px;font-weight:800;">H</td>
                          <td style="padding-left:13px;color:#2f2b3d;font-size:20px;font-weight:800;letter-spacing:.4px;">Huns<span style="color:#0d9fa3;">TAG</span></td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="color:#2f2b3d;font-size:28px;line-height:1.25;font-weight:800;padding-bottom:10px;">Reset your password</td>
                  </tr>
                  <tr>
                    <td style="color:#6f6b80;font-size:15px;line-height:1.65;padding-bottom:26px;">We received a request to reset your HunsTAG password. Enter this verification code on the password reset screen.</td>
                  </tr>
                  <tr>
                    <td style="padding-bottom:24px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#eefafa;border:1px solid #bfe8e7;border-radius:16px;">
                        <tr>
                          <td align="center" style="padding:19px 14px 7px;color:#0b8588;font-size:11px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;">Your verification code</td>
                        </tr>
                        <tr>
                          <td class="otp-code" align="center" style="padding:0 10px 20px;color:#232033;font-size:36px;line-height:1.2;font-weight:800;letter-spacing:11px;font-family:'Courier New',Courier,monospace;">${code}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:15px 17px;background:#f7f7fa;border-radius:12px;color:#5f5b70;font-size:13px;line-height:1.55;">
                      <strong style="color:#2f2b3d;">Expires in 10 minutes.</strong> For your security, this code can only be used once. Never share it with anyone.
                    </td>
                  </tr>
                  <tr>
                    <td style="padding-top:24px;color:#817d91;font-size:12px;line-height:1.6;">Didn't request this change? You can safely ignore this email. Your password will remain unchanged.</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 24px;background:#fafafa;border-top:1px solid #ececf1;color:#9591a2;font-size:11px;line-height:1.6;">
                Sent securely by HunsTAG<br>
                <span style="color:#0d9fa3;">A smart card for a smarter first impression.</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { text, html };
}

module.exports = { passwordResetEmail };
