const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const fontRegularPath = path.join(__dirname, '..', 'public', 'fonts', 'Font-Regular.ttf');
const fontBoldPath = path.join(__dirname, '..', 'public', 'fonts', 'Font-Bold.ttf');

const WORK_TYPE_LABELS = {
  full_time: 'Tam Zamanlı',
  part_time: 'Yarı Zamanlı',
  contract: 'Sözleşmeli / Proje Bazlı',
  seasonal: 'Dönemsel / Sezonluk',
  internship: 'Stajyer'
};

const CITY_LABELS = {
  girne: 'Girne',
  lefkosa: 'Lefkoşa',
  gazimagusa: 'Gazimağusa',
  guzelyurt: 'Güzelyurt',
  iskele: 'İskele',
  lefke: 'Lefke'
};

/**
 * Generates a branded CYPIlan PDF CV buffer.
 * @param {Object} data - { user, profile }
 * @returns {Promise<Buffer>}
 */
function generateCvPdf({ user, profile }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 36, bottom: 40, left: 40, right: 40 },
        autoFirstPage: true,
        info: {
          Title: `CYPILAN CV - ${user.full_name || 'Aday'}`,
          Author: 'CYPILAN.COM',
          Subject: 'Özgeçmiş Belgesi',
          Keywords: 'CYPILAN, CV, Özgeçmiş, Kıbrıs Kariyer'
        }
      });

      // Register Unicode-compliant fonts for full Turkish character support
      if (fs.existsSync(fontRegularPath)) {
        doc.registerFont('CustomRegular', fontRegularPath);
        doc.registerFont('CustomBold', fontBoldPath);
        doc.font('CustomRegular');
      } else {
        doc.font('Helvetica');
      }

      const fontR = fs.existsSync(fontRegularPath) ? 'CustomRegular' : 'Helvetica';
      const fontB = fs.existsSync(fontBoldPath) ? 'CustomBold' : 'Helvetica-Bold';

      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 40;
      const contentWidth = pageWidth - (margin * 2);

      // Function to draw watermark on background
      const drawWatermark = () => {
        doc.save();
        doc.opacity(0.045);
        doc.font(fontB).fontSize(54).fillColor('#0f172a');
        doc.rotate(-35, { origin: [pageWidth / 2, pageHeight / 2] });
        doc.text('CYPILAN.COM', pageWidth / 2 - 200, pageHeight / 2 - 25, {
          align: 'center',
          width: 400
        });
        doc.restore();
      };

      // Draw watermark on first page
      drawWatermark();

      // Top Accent Line
      doc.rect(0, 0, pageWidth, 5).fill('#0284c7');

      // Top Header Brand Area
      let currentY = 24;

      // Brand Logo on Left
      doc.font(fontB).fontSize(20).fillColor('#0284c7');
      doc.text('CYP', margin, currentY, { continued: true });
      doc.fillColor('#0f172a').text('ILAN', { continued: true });
      doc.fillColor('#0284c7').text('.COM');

      doc.font(fontR).fontSize(8).fillColor('#64748b');
      doc.text('Kıbrıs Dijital Kariyer & İlan Ekosistemi', margin, currentY + 22);

      // Official CV Badge on Right
      const badgeWidth = 160;
      const badgeHeight = 22;
      const badgeX = pageWidth - margin - badgeWidth;
      doc.roundedRect(badgeX, currentY + 2, badgeWidth, badgeHeight, 4).fillAndStroke('#f8fafc', '#cbd5e1');
      doc.font(fontB).fontSize(7.5).fillColor('#0369a1');
      doc.text('RESMİ CYPILAN ÖZGEÇMİŞİ', badgeX, currentY + 8, {
        width: badgeWidth,
        align: 'center'
      });

      currentY += 42;

      // Divider below brand header
      doc.strokeColor('#e2e8f0').lineWidth(0.8).moveTo(margin, currentY).lineTo(pageWidth - margin, currentY).stroke();
      currentY += 14;

      // Candidate Hero Card
      const heroHeight = 105;
      doc.roundedRect(margin, currentY, contentWidth, heroHeight, 8).fillAndStroke('#f8fafc', '#e2e8f0');

      // Profile Photo on left
      const photoSize = 75;
      const photoX = margin + 14;
      const photoY = currentY + 15;

      let photoDrawn = false;
      const candidatePhoto = (profile && profile.photo_url) || (user && user.avatar_url);

      if (candidatePhoto && typeof candidatePhoto === 'string' && candidatePhoto.startsWith('/uploads/')) {
        const photoDiskPath = path.join(__dirname, '..', 'public', candidatePhoto.replace(/^\//, ''));
        if (fs.existsSync(photoDiskPath)) {
          try {
            doc.save();
            doc.roundedRect(photoX, photoY, photoSize, photoSize, 6).clip();
            doc.image(photoDiskPath, photoX, photoY, { width: photoSize, height: photoSize, fit: [photoSize, photoSize] });
            doc.restore();
            // Photo border
            doc.roundedRect(photoX, photoY, photoSize, photoSize, 6).lineWidth(1.5).stroke('#0284c7');
            photoDrawn = true;
          } catch (imgErr) {
            console.error('PDF photo render error:', imgErr.message);
          }
        }
      }

      if (!photoDrawn) {
        // Fallback stylized avatar
        doc.roundedRect(photoX, photoY, photoSize, photoSize, 6).fillAndStroke('#e0f2fe', '#bae6fd');
        const initials = (user.full_name || 'A')
          .split(' ')
          .filter(Boolean)
          .map(p => p[0])
          .slice(0, 2)
          .join('')
          .toUpperCase();
        doc.font(fontB).fontSize(24).fillColor('#0369a1');
        doc.text(initials, photoX, photoY + 24, { width: photoSize, align: 'center' });
      }

      // Candidate Information (Name, Headline, Contacts)
      const textX = photoX + photoSize + 16;
      const textWidth = contentWidth - (photoSize + 40);

      doc.font(fontB).fontSize(16).fillColor('#0f172a');
      doc.text(user.full_name || 'İsimsiz Aday', textX, photoY - 2, { width: textWidth });

      doc.font(fontB).fontSize(10.5).fillColor('#0284c7');
      doc.text(profile && profile.headline ? profile.headline : 'Aday', textX, doc.y + 2, { width: textWidth });

      // Contact details grid
      const metaY = doc.y + 6;
      const col1X = textX;
      const col2X = textX + (textWidth / 2) + 5;
      const colWidth = (textWidth / 2) - 10;

      doc.font(fontR).fontSize(8.5).fillColor('#475569');

      // Email & Phone
      doc.font(fontB).fillColor('#334155').text('E-posta: ', col1X, metaY, { continued: true });
      doc.font(fontR).fillColor('#64748b').text(user.email || '-');

      doc.font(fontB).fillColor('#334155').text('Telefon: ', col2X, metaY, { continued: true });
      doc.font(fontR).fillColor('#64748b').text(user.phone || 'Belirtilmedi');

      // City & Work Type
      const cityKey = (profile && profile.preferred_city) ? String(profile.preferred_city).toLowerCase() : '';
      const cityName = CITY_LABELS[cityKey] || (profile && profile.preferred_city ? profile.preferred_city : 'Tüm Kıbrıs');
      const workTypeName = (profile && profile.preferred_work_type && WORK_TYPE_LABELS[profile.preferred_work_type])
        ? WORK_TYPE_LABELS[profile.preferred_work_type]
        : 'Belirtilmedi';

      const line2Y = metaY + 14;
      doc.font(fontB).fillColor('#334155').text('Konum: ', col1X, line2Y, { continued: true });
      doc.font(fontR).fillColor('#64748b').text(cityName);

      doc.font(fontB).fillColor('#334155').text('Çalışma Şekli: ', col2X, line2Y, { continued: true });
      doc.font(fontR).fillColor('#64748b').text(workTypeName);

      // Experience
      const line3Y = line2Y + 14;
      const expText = profile && Number(profile.experience_years) > 0
        ? `${profile.experience_years} Yıl Deneyim`
        : 'Yeni Başlayan / Giriş Seviyesi';

      doc.font(fontB).fillColor('#334155').text('Deneyim: ', col1X, line3Y, { continued: true });
      doc.font(fontR).fillColor('#64748b').text(expText);

      currentY += heroHeight + 16;

      // Section helper
      const drawSectionTitle = (title, iconText = '') => {
        // Check for page overflow
        if (currentY > pageHeight - 110) {
          doc.addPage();
          drawWatermark();
          currentY = 40;
        }

        doc.rect(margin, currentY, 4, 14).fill('#0284c7');
        doc.font(fontB).fontSize(11).fillColor('#0f172a');
        doc.text(title, margin + 10, currentY + 1);

        currentY += 18;
        doc.strokeColor('#f1f5f9').lineWidth(1).moveTo(margin, currentY).lineTo(pageWidth - margin, currentY).stroke();
        currentY += 8;
      };

      // 1. Summary / About
      if (profile && profile.summary && profile.summary.trim()) {
        drawSectionTitle('PROFESYONEL ÖZET');
        doc.font(fontR).fontSize(9.5).fillColor('#334155');
        doc.text(profile.summary.trim(), margin, currentY, {
          width: contentWidth,
          lineGap: 3.5,
          align: 'left'
        });
        currentY = doc.y + 14;
      }

      // 2. Education
      if (profile && profile.education && profile.education.trim()) {
        drawSectionTitle('EĞİTİM BİLGİLERİ');
        doc.font(fontR).fontSize(9.5).fillColor('#334155');
        doc.text(profile.education.trim(), margin, currentY, {
          width: contentWidth,
          lineGap: 3.5,
          align: 'left'
        });
        currentY = doc.y + 14;
      }

      // 3. Skills
      if (profile && profile.skills && profile.skills.trim()) {
        const skillList = profile.skills
          .split(/[,;\n]/)
          .map(s => s.trim())
          .filter(Boolean);

        if (skillList.length > 0) {
          drawSectionTitle('YETENEKLER & UZMANLIK ALANLARI');

          let pillX = margin;
          let pillY = currentY;
          const pillHeight = 20;

          skillList.forEach(skill => {
            const textWidth = doc.font(fontB).fontSize(8.5).widthOfString(skill);
            const pillWidth = textWidth + 16;

            if (pillX + pillWidth > pageWidth - margin) {
              pillX = margin;
              pillY += pillHeight + 6;
            }

            doc.roundedRect(pillX, pillY, pillWidth, pillHeight, 4).fillAndStroke('#f0fdf4', '#bbf7d0');
            doc.font(fontB).fontSize(8.5).fillColor('#166534');
            doc.text(skill, pillX, pillY + 5.5, { width: pillWidth, align: 'center' });

            pillX += pillWidth + 8;
          });

          currentY = pillY + pillHeight + 14;
        }
      }

      // 4. Languages
      if (profile && profile.languages && profile.languages.trim()) {
        const langList = profile.languages
          .split(/[,;\n]/)
          .map(l => l.trim())
          .filter(Boolean);

        if (langList.length > 0) {
          drawSectionTitle('YABANCI DİLLER');

          let pillX = margin;
          let pillY = currentY;
          const pillHeight = 20;

          langList.forEach(langItem => {
            const textWidth = doc.font(fontB).fontSize(8.5).widthOfString(langItem);
            const pillWidth = textWidth + 16;

            if (pillX + pillWidth > pageWidth - margin) {
              pillX = margin;
              pillY += pillHeight + 6;
            }

            doc.roundedRect(pillX, pillY, pillWidth, pillHeight, 4).fillAndStroke('#f0f9ff', '#bae6fd');
            doc.font(fontB).fontSize(8.5).fillColor('#0369a1');
            doc.text(langItem, pillX, pillY + 5.5, { width: pillWidth, align: 'center' });

            pillX += pillWidth + 8;
          });

          currentY = pillY + pillHeight + 14;
        }
      }

      // 5. Certificates & Courses
      if (profile && profile.certificates && profile.certificates.trim()) {
        drawSectionTitle('SERTİFİKALAR & BELGELER');
        doc.font(fontR).fontSize(9.5).fillColor('#334155');
        doc.text(profile.certificates.trim(), margin, currentY, {
          width: contentWidth,
          lineGap: 3.5,
          align: 'left'
        });
        currentY = doc.y + 14;
      }

      // Footer
      const footerY = pageHeight - 32;
      doc.strokeColor('#e2e8f0').lineWidth(0.8).moveTo(margin, footerY - 8).lineTo(pageWidth - margin, footerY - 8).stroke();

      const todayStr = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      doc.font(fontR).fontSize(7.5).fillColor('#94a3b8');
      doc.text('Bu özgeçmiş CYPILAN.COM Kariyer Portalı üzerinden dijital ve güvenli olarak oluşturulmuştur.', margin, footerY);
      doc.text(`Tarih: ${todayStr}`, pageWidth - margin - 120, footerY, { width: 120, align: 'right' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateCvPdf
};
