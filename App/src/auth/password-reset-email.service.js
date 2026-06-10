const nodemailer = require('nodemailer');

function getMailConfig() {
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
  };
}

function isEmailConfigured() {
  const cfg = getMailConfig();
  return Boolean(cfg.host && cfg.user && cfg.pass && cfg.from);
}

async function sendPasswordResetEmail({ toEmail, token }) {
  if (!isEmailConfigured()) {
    return { sent: false, reason: 'SMTP_NOT_CONFIGURED' };
  }

  const cfg = getMailConfig();
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
  });

  const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3001';
  const resetUrl = `${appBaseUrl.replace(/\/$/, '')}/reset-password.html?token=${encodeURIComponent(token)}`;

  const info = await transporter.sendMail({
    from: cfg.from,
    to: toEmail,
    subject: 'ShowDeal - Password reset',
    text: `Use this link to reset your password: ${resetUrl}\n\nThis link expires in 15 minutes.`,
    html: `<p>Use this link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 15 minutes.</p>`,
  });

  return {
    sent: true,
    messageId: info.messageId,
  };
}

module.exports = {
  isEmailConfigured,
  sendPasswordResetEmail,
};
