const nodemailer = require("nodemailer");

// SMTP transport — all config from environment variables
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "localhost",
  port: parseInt(process.env.SMTP_PORT || "587", 10),
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASSWORD || "",
  },
  tls: {
    // Shared hosting may use a different domain on the certificate
    rejectUnauthorized: false,
  },
  debug: true,
  logger: true,
});

const FROM = process.env.SMTP_FROM || "notifications@multiportal.com";

/**
 * Send a password reset email with a styled HTML template.
 * @param {string} to — recipient email
 * @param {string} resetToken — the reset token
 * @param {string} userName — optional user name for personalization
 */
async function sendPasswordResetEmail(to, resetToken, userName) {
  const firstName = userName ? userName.split(" ")[0] : "there";
  const subject = "Password Reset — MultiPortal Listing Manager";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#0f0c29;font-family:system-ui,-apple-system,sans-serif;color:#fff">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0f0c29,#302b63,#24243e);min-height:100vh">
    <tr>
      <td align="center" style="padding:2rem 1rem">
        <table role="presentation" width="500" cellpadding="0" cellspacing="0" style="max-width:500px;width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:16px;overflow:hidden">
          <!-- Header -->
          <tr>
            <td style="padding:2rem 2rem 1rem;text-align:center">
              <h1 style="margin:0;font-size:1.6rem;font-weight:800;background:linear-gradient(90deg,#e94560,#f39c12);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">MultiPortal</h1>
              <p style="margin:0.25rem 0 0;font-size:0.85rem;color:rgba(255,255,255,0.5)">Listing Manager</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:1.5rem 2rem">
              <h2 style="margin:0 0 1rem;font-size:1.2rem;color:#fff">Password Reset Request</h2>
              <p style="margin:0 0 1rem;color:rgba(255,255,255,0.75);line-height:1.6;font-size:0.95rem">
                Hi ${firstName},
              </p>
              <p style="margin:0 0 1rem;color:rgba(255,255,255,0.75);line-height:1.6;font-size:0.95rem">
                We received a request to reset your password. Use the reset code below to set a new password for your MultiPortal account.
              </p>
              <!-- Reset Code Box -->
              <div style="margin:1.5rem 0;padding:1.25rem;background:rgba(233,69,96,0.1);border:1px solid rgba(233,69,96,0.3);border-radius:12px;text-align:center">
                <p style="margin:0 0 0.5rem;font-size:0.75rem;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1px">Your Reset Code</p>
                <p style="margin:0;font-size:1.5rem;font-weight:700;color:#e94560;font-family:monospace;letter-spacing:2px;word-break:break-all">${resetToken}</p>
              </div>
              <p style="margin:0 0 1rem;color:rgba(255,255,255,0.75);line-height:1.6;font-size:0.95rem">
                Paste this code into the reset form to continue. This code will expire in <strong style="color:#f39c12">1 hour</strong>.
              </p>
              <!-- Security Note -->
              <div style="margin:1.5rem 0;padding:1rem;background:rgba(255,255,255,0.05);border-radius:8px;border-left:3px solid #f39c12">
                <p style="margin:0;font-size:0.85rem;color:rgba(255,255,255,0.6);line-height:1.5">
                  <strong style="color:#f39c12">Security note:</strong> If you did not request a password reset, you can safely ignore this email. Your password will not be changed.
                </p>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:1rem 2rem 2rem;border-top:1px solid rgba(255,255,255,0.08)">
              <p style="margin:0;font-size:0.75rem;color:rgba(255,255,255,0.3);text-align:center;line-height:1.5">
                MultiPortal Listing Manager · This is an automated message, please do not reply.<br>
                © 2026 MultiPortal. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `MultiPortal Listing Manager — Password Reset\n\nHi ${firstName},\n\nWe received a request to reset your password. Use the reset code below:\n\n${resetToken}\n\nThis code will expire in 1 hour.\n\nIf you did not request a password reset, you can safely ignore this email.\n\nMultiPortal Listing Manager`;

  await transporter.sendMail({
    from: `MultiPortal <${FROM}>`,
    to,
    subject,
    html,
    text,
  });
}

module.exports = { sendPasswordResetEmail };
