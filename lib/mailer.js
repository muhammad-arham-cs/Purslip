// Sends password-reset emails via SMTP when configured. If no SMTP_HOST is
// set (e.g. local dev, or production before real email is wired up), falls
// back to logging the reset link to the server console — a documented
// interim approach rather than a hard requirement on email infrastructure.
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;

  const nodemailer = require('nodemailer');
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transporter;
}

async function sendPasswordResetEmail(toEmail, resetUrl) {
  const smtp = getTransporter();

  if (!smtp) {
    console.log(
      `[mailer] SMTP not configured — password reset link for ${toEmail}: ${resetUrl}`
    );
    return { delivered: false, viaConsole: true };
  }

  await smtp.sendMail({
    from: process.env.SMTP_FROM || 'Purslip <no-reply@purslip.local>',
    to: toEmail,
    subject: 'Reset your Purslip password',
    text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
    html: `<p>Reset your password by clicking the link below. This link expires in 1 hour.</p>
           <p><a href="${resetUrl}">${resetUrl}</a></p>
           <p>If you didn't request this, ignore this email.</p>`,
  });
  return { delivered: true, viaConsole: false };
}

module.exports = { sendPasswordResetEmail };
