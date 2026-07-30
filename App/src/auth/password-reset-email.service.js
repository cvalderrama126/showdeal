const nodemailer = require('nodemailer');

function getMailConfig() {
  const rejectUnauthorized = process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false';
  const useEthereal = process.env.SMTP_USE_ETHEREAL === 'true';
  const useStream = process.env.SMTP_USE_STREAM === 'true';

  return {
    useStream,
    useEthereal,
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    rejectUnauthorized,
  };
}

function isEmailConfigured() {
  const cfg = getMailConfig();
  if (cfg.useStream) return true;
  if (cfg.useEthereal) return true;
  return Boolean(cfg.host && cfg.user && cfg.pass && cfg.from);
}

async function sendPasswordResetEmail({ toEmail, token }) {
  if (!isEmailConfigured()) {
    return {
      sent: false,
      reason: 'SMTP_NOT_CONFIGURED',
      message: 'SMTP is not configured on the server.',
    };
  }

  try {
    const cfg = getMailConfig();
    let transporter;

    if (cfg.useStream) {
      transporter = nodemailer.createTransport({
        streamTransport: true,
        newline: 'unix',
        buffer: true,
      });
    } else if (cfg.useEthereal) {
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    } else {
      transporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: {
          user: cfg.user,
          pass: cfg.pass,
        },
        tls: {
          rejectUnauthorized: cfg.rejectUnauthorized,
        },
      });
    }

    await transporter.verify();

    const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3001';
    const resetUrl = `${appBaseUrl.replace(/\/$/, '')}/reset-password.html?token=${encodeURIComponent(token)}`;

    const info = await transporter.sendMail({
      from: cfg.from,
      to: toEmail,
      subject: 'ShowDeal - Password reset',
      text: `Use this link to reset your password: ${resetUrl}\n\nThis link expires in 15 minutes.`,
      html: `<p>Use this link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 15 minutes.</p>`,
    });

    if (cfg.useStream) {
      console.log('[password-reset-mail][stream-mode]', {
        toEmail,
        messageId: info.messageId,
        resetUrl,
      });
    }

    return {
      sent: true,
      messageId: info.messageId,
      previewUrl: nodemailer.getTestMessageUrl(info) || null,
    };
  } catch (error) {
    console.error('Password reset email send failed:', {
      message: error?.message,
      code: error?.code,
      responseCode: error?.responseCode,
      command: error?.command,
    });

    return {
      sent: false,
      reason: 'SMTP_SEND_FAILED',
      message: 'SMTP rejected the email delivery request.',
    };
  }
}

module.exports = {
  isEmailConfigured,
  sendPasswordResetEmail,
};
