const nodemailer = require("nodemailer");
const { config } = require("./runtime-config");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SMTP_HOST = config.SMTP_HOST;
const SMTP_PORT = config.SMTP_PORT;
const SMTP_USER = config.SMTP_USER;
const SMTP_SECURE = config.SMTP_SECURE ?? SMTP_PORT === 465;
const SMTP_REQUIRE_TLS = SMTP_SECURE ? false : config.SMTP_REQUIRE_TLS ?? true;
const SMTP_TLS_ALLOW_INVALID_CERTS = config.SMTP_TLS_ALLOW_INVALID_CERTS === true;
const SMTP_CONNECTION_TIMEOUT_MS = 15000;
const SMTP_GREETING_TIMEOUT_MS = 10000;
const SMTP_SOCKET_TIMEOUT_MS = 20000;

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  requireTLS: SMTP_REQUIRE_TLS,
  connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
  greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
  socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
  auth: {
    user: SMTP_USER,
    pass: config.SMTP_PASSWORD,
  },
  ...(SMTP_TLS_ALLOW_INVALID_CERTS
    ? {
      tls: {
        rejectUnauthorized: false,
      },
    }
    : {}),
});

function normalizeEmail(value) {
  const trimmed = String(value || "").trim();
  return EMAIL_RE.test(trimmed) ? trimmed : "";
}

function getEmailDomain(email) {
  return normalizeEmail(email).split("@")[1] || "";
}

const FROM = normalizeEmail(config.SMTP_FROM);
const FROM_NAME = String(config.SMTP_FROM_NAME || "MultiPortal").trim() || "MultiPortal";
const REPLY_TO = normalizeEmail(config.SMTP_REPLY_TO) || FROM;
const SENDER = normalizeEmail(config.SMTP_SENDER);

if (!EMAIL_RE.test(SMTP_USER) && !SENDER) {
  console.warn(
    "Mail config warning: SMTP_USER does not look like an email address and SMTP_SENDER is not set. Make sure SMTP_FROM belongs to a mailbox/domain authorized on this SMTP relay.",
  );
}

if (EMAIL_RE.test(SMTP_USER) && getEmailDomain(SMTP_USER) !== getEmailDomain(FROM)) {
  console.warn(
    `Mail config warning: SMTP_FROM domain (${getEmailDomain(FROM)}) differs from SMTP_USER domain (${getEmailDomain(SMTP_USER)}). If SPF/DKIM/DMARC are not aligned, mailbox providers may junk or reject messages.`,
  );
}

if (SMTP_TLS_ALLOW_INVALID_CERTS) {
  console.warn("Mail config warning: SMTP_TLS_ALLOW_INVALID_CERTS=true disables SMTP certificate verification. Use this only for temporary local debugging.");
}

async function logTransportStatus() {
  try {
    await transporter.verify();
    console.log(`SMTP transport verified for ${SMTP_HOST}:${SMTP_PORT} (${SMTP_SECURE ? "SSL/TLS" : SMTP_REQUIRE_TLS ? "STARTTLS" : "plain"})`);
  } catch (error) {
    console.error(`SMTP transport verify failed for ${SMTP_HOST}:${SMTP_PORT}: ${error.message}`);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getFirstName(userName) {
  return userName ? userName.split(" ")[0] : "there";
}

function buildEmailHtml({ subject, headline, firstName, intro, contentHtml, footerNote }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#0f0c29;font-family:system-ui,-apple-system,sans-serif;color:#fff">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#0f0c29,#302b63,#24243e);min-height:100vh">
    <tr>
      <td align="center" style="padding:2rem 1rem">
        <table role="presentation" width="500" cellpadding="0" cellspacing="0" style="max-width:500px;width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:16px;overflow:hidden">
          <tr>
            <td style="padding:2rem 2rem 1rem;text-align:center">
              <h1 style="margin:0;font-size:1.6rem;font-weight:800;background:linear-gradient(90deg,#e94560,#f39c12);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">MultiPortal</h1>
              <p style="margin:0.25rem 0 0;font-size:0.85rem;color:rgba(255,255,255,0.5)">Listing Manager</p>
            </td>
          </tr>
          <tr>
            <td style="padding:1.5rem 2rem">
              <h2 style="margin:0 0 1rem;font-size:1.2rem;color:#fff">${escapeHtml(headline)}</h2>
              <p style="margin:0 0 1rem;color:rgba(255,255,255,0.75);line-height:1.6;font-size:0.95rem">Hi ${escapeHtml(firstName)},</p>
              <p style="margin:0 0 1rem;color:rgba(255,255,255,0.75);line-height:1.6;font-size:0.95rem">${escapeHtml(intro)}</p>
              ${contentHtml}
              <div style="margin:1.5rem 0;padding:1rem;background:rgba(255,255,255,0.05);border-radius:8px;border-left:3px solid #f39c12">
                <p style="margin:0;font-size:0.85rem;color:rgba(255,255,255,0.6);line-height:1.5">${footerNote}</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:1rem 2rem 2rem;border-top:1px solid rgba(255,255,255,0.08)">
              <p style="margin:0;font-size:0.75rem;color:rgba(255,255,255,0.3);text-align:center;line-height:1.5">
                MultiPortal Listing Manager - This is an automated message, please do not reply.<br>
                (c) 2026 MultiPortal. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function sendMail({ to, subject, html, text }) {
  return transporter.sendMail({
    from: `${FROM_NAME} <${FROM}>`,
    ...(REPLY_TO ? { replyTo: REPLY_TO } : {}),
    ...(SENDER ? { sender: SENDER } : {}),
    to,
    subject,
    html,
    text,
    headers: {
      "X-Auto-Response-Suppress": "All",
    },
  });
}

function formatMailDeliveryResult(mailInfo) {
  return {
    messageId: mailInfo?.messageId || "",
    accepted: Array.isArray(mailInfo?.accepted) ? mailInfo.accepted : [],
    rejected: Array.isArray(mailInfo?.rejected) ? mailInfo.rejected : [],
    pending: Array.isArray(mailInfo?.pending) ? mailInfo.pending : [],
    response: mailInfo?.response || "",
  };
}

async function sendPasswordResetEmail(to, resetCode, userName, activatesAccount = false) {
  const firstName = getFirstName(userName);
  const subject = activatesAccount
    ? "Activate Your Account and Set a New Password - MultiPortal Listing Manager"
    : "Password Reset - MultiPortal Listing Manager";
  const intro = activatesAccount
    ? "Your account is not active yet. Use the reset code below to activate your account and choose a new password."
    : "We received a request to reset your password. Use the reset code below to set a new password for your MultiPortal account.";
  const footerNote = activatesAccount
    ? '<strong style="color:#f39c12">Activation note:</strong> This code will activate your account after you set a new password.'
    : '<strong style="color:#f39c12">Security note:</strong> If you did not request a password reset, you can safely ignore this email. Your password will not be changed.';

  const html = buildEmailHtml({
    subject,
    headline: activatesAccount ? "Activate Account" : "Password Reset Request",
    firstName,
    intro,
    contentHtml: `
      <div style="margin:1.5rem 0;padding:1.25rem;background:rgba(233,69,96,0.1);border:1px solid rgba(233,69,96,0.3);border-radius:12px;text-align:center">
        <p style="margin:0 0 0.5rem;font-size:0.75rem;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:1px">Your Reset Code</p>
        <p style="margin:0;font-size:1.5rem;font-weight:700;color:#e94560;font-family:monospace;letter-spacing:6px">${escapeHtml(resetCode)}</p>
      </div>
      <p style="margin:0 0 1rem;color:rgba(255,255,255,0.75);line-height:1.6;font-size:0.95rem">
        Paste this code into the reset form to continue. This code will expire in <strong style="color:#f39c12">1 hour</strong>.
      </p>`,
    footerNote,
  });

  const text = activatesAccount
    ? `MultiPortal Listing Manager - Activate Account\n\nHi ${firstName},\n\nYour account is not active yet. Use the reset code below to activate your account and choose a new password:\n\n${resetCode}\n\nThis code will expire in 1 hour.\n\nMultiPortal Listing Manager`
    : `MultiPortal Listing Manager - Password Reset\n\nHi ${firstName},\n\nWe received a request to reset your password. Use the reset code below:\n\n${resetCode}\n\nThis code will expire in 1 hour.\n\nIf you did not request a password reset, you can safely ignore this email.\n\nMultiPortal Listing Manager`;

  return sendMail({ to, subject, html, text });
}

async function sendAccountActivationEmail(to, activationUrl, userName) {
  const firstName = getFirstName(userName);
  const subject = "Activate Your Account - MultiPortal Listing Manager";
  const safeUrl = escapeHtml(activationUrl);
  const html = buildEmailHtml({
    subject,
    headline: "Confirm Your Account",
    firstName,
    intro: "Thanks for registering. Confirm your email address by clicking the activation button below.",
    contentHtml: `
      <div style="margin:1.5rem 0;text-align:center">
        <a href="${safeUrl}" style="display:inline-block;padding:0.9rem 1.5rem;background:linear-gradient(90deg,#e94560,#c23152);color:#fff;text-decoration:none;font-weight:700;border-radius:10px">Activate Account</a>
      </div>
      <p style="margin:0 0 0.75rem;color:rgba(255,255,255,0.75);line-height:1.6;font-size:0.95rem">
        This activation link will expire in <strong style="color:#f39c12">1 hour</strong>.
      </p>
      <p style="margin:0;color:rgba(255,255,255,0.65);line-height:1.6;font-size:0.9rem">
        If the button does not work, copy and paste this link into your browser:
      </p>
      <p style="margin:0.75rem 0 0;word-break:break-word;font-size:0.88rem;line-height:1.6">
        <a href="${safeUrl}" style="color:#f39c12;text-decoration:underline">${safeUrl}</a>
      </p>`,
    footerNote: '<strong style="color:#f39c12">Need help?</strong> If the link expires, use "Forgot password" on the login screen to activate your account and set a new password.',
  });

  const text = `MultiPortal Listing Manager - Activate Your Account\n\nHi ${firstName},\n\nThanks for registering. Activate your account by opening the link below:\n\n${activationUrl}\n\nThis activation link will expire in 1 hour.\n\nIf the link expires, use "Forgot password" on the login screen to activate your account and set a new password.\n\nMultiPortal Listing Manager`;

  return sendMail({ to, subject, html, text });
}

module.exports = {
  formatMailDeliveryResult,
  sendPasswordResetEmail,
  sendAccountActivationEmail,
};

void logTransportStatus();
