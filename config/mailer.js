const nodemailer = require('nodemailer');
const appConfig = require('./app');

const isSmtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);

let transporter;

if (isSmtpConfigured) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
} else {
  // Local development / fallback transport
  transporter = nodemailer.createTransport({
    jsonTransport: true
  });
}

const DEFAULT_FROM = process.env.MAIL_FROM || 'CYPILAN.COM <noreply@cypilan.com>';
const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

/**
 * Base address for links that leave the site — password resets, notification
 * e-mails.
 *
 * The configured APP_URL is authoritative in production. In development the
 * same server answers to several names: localhost on the machine it runs on,
 * a LAN address from a phone on the same network. A reset link built from the
 * configured name is a dead end for everyone reading it somewhere else, so
 * there the host the request actually came in on wins.
 */
function baseUrlFor(req) {
  if (process.env.NODE_ENV === 'production' || !req || typeof req.get !== 'function') {
    return APP_URL;
  }

  const host = req.get('host');
  return host ? `${req.protocol}://${host}` : APP_URL;
}

async function sendMail({ to, subject, html, text }) {
  if (!to) return false;

  const mailOptions = {
    from: DEFAULT_FROM,
    to,
    subject,
    text: text || html.replace(/<[^>]*>?/gm, ''),
    html
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    if (!isSmtpConfigured) {
      console.log(`\n================ [MAILER DEV LOG] ================`);
      console.log(`TO:      ${to}`);
      console.log(`SUBJECT: ${subject}`);
      console.log(`CONTENT:\n${mailOptions.text}`);
      console.log(`==================================================\n`);
    } else {
      console.log(`[MAILER] Sent email to ${to} (MessageID: ${info.messageId})`);
    }
    return true;
  } catch (err) {
    console.error(`[MAILER ERROR] Failed to send email to ${to}:`, err.message);
    return false;
  }
}

function getBaseTemplate({ title, content, ctaUrl, ctaText }) {
  return `
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: 'Segoe UI', Helvetica, Arial, sans-serif; background-color: #f5f7fa; color: #2c3e50; margin: 0; padding: 20px; }
        .card { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
        .header { background: #3A7CA5; color: #ffffff; padding: 24px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px; }
        .body { padding: 32px 24px; line-height: 1.6; }
        .btn { display: inline-block; background-color: #E8982D; color: #ffffff !important; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 30px; margin: 20px 0; text-align: center; }
        .footer { background: #f8fafc; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1>CYPILAN.COM</h1>
        </div>
        <div class="body">
          <h2 style="margin-top:0; font-size: 20px; color: #1e293b;">${title}</h2>
          ${content}
          ${ctaUrl && ctaText ? `<div style="text-align: center;"><a href="${ctaUrl}" class="btn" target="_blank">${ctaText}</a></div>` : ''}
        </div>
        <div class="footer">
          <p style="margin: 0;">CYPILAN.COM — Kıbrıs Dijital Pazaryeri & İlan Ekosistemi</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const title = 'Şifre Sıfırlama Talebi / Password Reset Request';
  const content = `
    <p>Merhaba ${name || 'Kullanıcımız'},</p>
    <p>Hesabınız için şifre sıfırlama talebinde bulunuldu. Şifrenizi yenilemek için aşağıdaki butona tıklayın:</p>
    <p style="font-size: 13px; color: #64748b;">Bu bağlantı 1 saat boyunca geçerlidir. Sıfırlama talebinde bulunmadıysanız bu e-postayı dikkate almayabilirsiniz.</p>
  `;
  return sendMail({
    to,
    subject: 'CYPILAN.COM - Şifre Sıfırlama Bağlantısı',
    html: getBaseTemplate({
      title,
      content,
      ctaUrl: resetUrl,
      ctaText: 'Şifremi Yenile'
    })
  });
}

async function sendWelcomeEmail({ to, name, baseUrl }) {
  const title = 'CYPILAN.COM\'a Hoş Geldiniz!';
  const content = `
    <p>Merhaba ${name || 'Kullanıcımız'},</p>
    <p>CYPILAN.COM ailesine katıldığınız için teşekkür ederiz. Ücretsiz ilan verebilir, satıcılarla anında iletişime geçebilirsiniz.</p>
  `;
  return sendMail({
    to,
    subject: 'CYPILAN.COM\'a Hoş Geldiniz',
    html: getBaseTemplate({
      title,
      content,
      ctaUrl: `${baseUrl || APP_URL}/listings/create`,
      ctaText: 'Hemen İlan Ver'
    })
  });
}

async function sendMessageNotificationEmail({ to, senderName, listingTitle, conversationUrl }) {
  const title = 'Yeni Mesajınız Var!';
  const content = `
    <p><strong>${senderName || 'Bir kullanıcı'}</strong> size <em>"${listingTitle || 'İlanınız'}"</em> hakkında yeni bir mesaj gönderdi.</p>
    <p>Mesajı okumak ve yanıtlamak için aşağıdaki butona tıklayın:</p>
  `;
  return sendMail({
    to,
    subject: `Yeni Mesaj: ${listingTitle || 'CYPILAN.COM'}`,
    html: getBaseTemplate({
      title,
      content,
      ctaUrl: conversationUrl || `${APP_URL}/messages`,
      ctaText: 'Mesajı Gör'
    })
  });
}

async function sendListingStatusEmail({ to, listingTitle, status, reason, listingUrl }) {
  const isApproved = status === 'active';
  const title = isApproved ? 'İlanınız Onaylandı 🎉' : 'İlanınız Güncellenmeli';
  const content = isApproved
    ? `<p><strong>"${listingTitle}"</strong> başlıklı ilanınız yayına alınmıştır.</p>`
    : `<p><strong>"${listingTitle}"</strong> başlıklı ilanınız incelendi ve şu nedenle yayına alınamadı:</p><blockquote style="background: #fff1f2; color: #991b1b; padding: 12px; border-left: 4px solid #f43f5e; margin: 12px 0;">${reason || 'İlan kurallarına uygunluk sağlanmalıdır.'}</blockquote>`;

  return sendMail({
    to,
    subject: `İlan Durumu: ${listingTitle}`,
    html: getBaseTemplate({
      title,
      content,
      ctaUrl: listingUrl || `${APP_URL}/profile/listings`,
      ctaText: isApproved ? 'İlanı Görüntüle' : 'İlanımı Düzenle'
    })
  });
}

module.exports = {
  sendMail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendMessageNotificationEmail,
  sendListingStatusEmail,
  baseUrlFor,
  APP_URL
};
