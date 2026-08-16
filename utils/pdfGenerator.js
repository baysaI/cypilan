const PDFDocument = require('pdfkit');
const sharp = require('sharp');
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
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 25, bottom: 15, left: 36, right: 36 },
        bufferPages: true,
        autoFirstPage: true,
        info: {
          Title: `CYPILAN CV - ${user ? user.full_name || 'Aday' : 'Aday'}`,
          Author: 'CYPILAN.COM',
          Subject: 'Özgeçmiş Belgesi',
          Keywords: 'CYPILAN, CV, Özgeçmiş, Kıbrıs Kariyer'
        }
      });

      const fontR = fs.existsSync(fontRegularPath) ? 'CustomRegular' : 'Helvetica';
      const fontB = fs.existsSync(fontBoldPath) ? 'CustomBold' : 'Helvetica-Bold';

      if (fs.existsSync(fontRegularPath)) {
        doc.registerFont('CustomRegular', fontRegularPath);
        doc.registerFont('CustomBold', fontBoldPath);
      }

      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', (err) => reject(err));

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const margin = 36;
      const contentWidth = pageWidth - (margin * 2);

      const candidateUser = user || {};
      const candidateProfile = profile || {};

      // ==========================================
      // 1. TOP HEADER BRAND
      // ==========================================
      // Top colored bar
      doc.rect(0, 0, pageWidth, 4).fill('#0284c7');

      let currentY = 18;

      // Brand Logo on Left
      doc.font(fontB).fontSize(19).fillColor('#0284c7').text('CYP', margin, currentY, { lineBreak: false });
      const cypWidth = doc.widthOfString('CYP');
      doc.fillColor('#0f172a').text('ILAN', margin + cypWidth, currentY, { lineBreak: false });
      const ilanWidth = doc.widthOfString('ILAN');
      doc.fillColor('#0284c7').text('.COM', margin + cypWidth + ilanWidth, currentY, { lineBreak: false });

      doc.font(fontR).fontSize(7.5).fillColor('#64748b').text('Kıbrıs Dijital Kariyer & İlan Ekosistemi', margin, currentY + 22, { lineBreak: false });

      // Official CV Badge on Right
      const badgeWidth = 145;
      const badgeHeight = 22;
      const badgeX = pageWidth - margin - badgeWidth;
      doc.roundedRect(badgeX, currentY + 2, badgeWidth, badgeHeight, 4).fillAndStroke('#f8fafc', '#cbd5e1');
      doc.font(fontB).fontSize(7.5).fillColor('#0369a1').text('RESMİ CYPILAN ÖZGEÇMİŞİ', badgeX, currentY + 8, {
        width: badgeWidth,
        align: 'center',
        lineBreak: false
      });

      currentY += 40;

      // Header border line
      doc.strokeColor('#e2e8f0').lineWidth(0.8).moveTo(margin, currentY).lineTo(pageWidth - margin, currentY).stroke();
      currentY += 12;

      // ==========================================
      // 2. CANDIDATE HERO CARD
      // ==========================================
      const heroHeight = 100;
      doc.roundedRect(margin, currentY, contentWidth, heroHeight, 8).fillAndStroke('#f8fafc', '#e2e8f0');

      // Profile Photo on left
      const photoSize = 72;
      const photoX = margin + 14;
      const photoY = currentY + 14;

      let photoDrawn = false;
      const candidatePhoto = candidateProfile.photo_url || candidateUser.avatar_url;

      if (candidatePhoto && typeof candidatePhoto === 'string' && candidatePhoto.startsWith('/uploads/')) {
        const photoDiskPath = path.join(__dirname, '..', 'public', candidatePhoto.replace(/^\//, ''));
        if (fs.existsSync(photoDiskPath)) {
          try {
            const rawImgBuffer = await fs.promises.readFile(photoDiskPath);
            const photoBuffer = await sharp(rawImgBuffer)
              .rotate()
              .resize(220, 220, { fit: 'cover', position: 'center' })
              .png()
              .toBuffer();

            doc.save();
            doc.roundedRect(photoX, photoY, photoSize, photoSize, 6).clip();
            doc.image(photoBuffer, photoX, photoY, { width: photoSize, height: photoSize });
            doc.restore();
            doc.roundedRect(photoX, photoY, photoSize, photoSize, 6).lineWidth(1.2).stroke('#0284c7');
            photoDrawn = true;
          } catch (imgErr) {
            console.error('PDF photo render error:', imgErr.message);
          }
        }
      }

      if (!photoDrawn) {
        doc.roundedRect(photoX, photoY, photoSize, photoSize, 6).fillAndStroke('#e0f2fe', '#bae6fd');
        const initials = (candidateUser.full_name || 'Aday')
          .split(' ')
          .filter(Boolean)
          .map(p => p[0])
          .slice(0, 2)
          .join('')
          .toUpperCase();
        doc.font(fontB).fontSize(22).fillColor('#0369a1');
        doc.text(initials, photoX, photoY + 24, { width: photoSize, align: 'center', lineBreak: false });
      }

      // Candidate Text Details (Name, Headline, Contacts)
      const textX = photoX + photoSize + 16;
      const textWidth = contentWidth - (photoSize + 36);

      doc.font(fontB).fontSize(15).fillColor('#0f172a');
      doc.text(candidateUser.full_name || 'İsimsiz Aday', textX, photoY - 2, { width: textWidth, lineBreak: false });

      doc.font(fontB).fontSize(10).fillColor('#0284c7');
      doc.text(candidateProfile.headline || 'Aday', textX, photoY + 18, { width: textWidth, lineBreak: false });

      // Contact details 2-column grid
      const metaY = photoY + 36;
      const col1X = textX;
      const col2X = textX + (textWidth / 2) + 6;
      const colWidth = (textWidth / 2) - 10;

      // Row 1: Email & Phone
      doc.font(fontB).fontSize(8).fillColor('#475569').text('E-posta: ', col1X, metaY, { lineBreak: false });
      doc.font(fontR).fontSize(8).fillColor('#0f172a').text(candidateUser.email || '-', col1X + 40, metaY, { width: colWidth - 40, lineBreak: false });

      doc.font(fontB).fontSize(8).fillColor('#475569').text('Telefon: ', col2X, metaY, { lineBreak: false });
      doc.font(fontR).fontSize(8).fillColor('#0f172a').text(candidateUser.phone || 'Belirtilmedi', col2X + 40, metaY, { width: colWidth - 40, lineBreak: false });

      // Row 2: City & Work Type
      const cityKey = candidateProfile.preferred_city ? String(candidateProfile.preferred_city).toLowerCase() : '';
      const cityName = CITY_LABELS[cityKey] || candidateProfile.preferred_city || 'Tüm Kıbrıs';
      const workTypeName = (candidateProfile.preferred_work_type && WORK_TYPE_LABELS[candidateProfile.preferred_work_type])
        ? WORK_TYPE_LABELS[candidateProfile.preferred_work_type]
        : 'Belirtilmedi';

      const line2Y = metaY + 14;
      doc.font(fontB).fontSize(8).fillColor('#475569').text('Konum: ', col1X, line2Y, { lineBreak: false });
      doc.font(fontR).fontSize(8).fillColor('#0f172a').text(cityName, col1X + 40, line2Y, { width: colWidth - 40, lineBreak: false });

      doc.font(fontB).fontSize(8).fillColor('#475569').text('Çalışma: ', col2X, line2Y, { lineBreak: false });
      doc.font(fontR).fontSize(8).fillColor('#0f172a').text(workTypeName, col2X + 40, line2Y, { width: colWidth - 40, lineBreak: false });

      // Row 3: Experience
      const line3Y = line2Y + 14;
      const expText = candidateProfile.experience_years && Number(candidateProfile.experience_years) > 0
        ? `${candidateProfile.experience_years} Yıl Deneyim`
        : 'Yeni Başlayan / Giriş Seviyesi';

      doc.font(fontB).fontSize(8).fillColor('#475569').text('Deneyim: ', col1X, line3Y, { lineBreak: false });
      doc.font(fontR).fontSize(8).fillColor('#0f172a').text(expText, col1X + 40, line3Y, { width: colWidth - 40, lineBreak: false });

      currentY += heroHeight + 16;

      // ==========================================
      // 3. SECTIONS
      // ==========================================
      const drawSectionHeader = (title) => {
        if (currentY > pageHeight - 90) {
          doc.addPage();
          currentY = 32;
        }

        doc.rect(margin, currentY, 3.5, 13).fill('#0284c7');
        doc.font(fontB).fontSize(10).fillColor('#0f172a');
        doc.text(title, margin + 8, currentY + 1, { lineBreak: false });

        currentY += 16;
        doc.strokeColor('#e2e8f0').lineWidth(0.6).moveTo(margin, currentY).lineTo(pageWidth - margin, currentY).stroke();
        currentY += 6;
      };

      // 1. Profesyonel Özet
      if (candidateProfile.summary && candidateProfile.summary.trim()) {
        drawSectionHeader('PROFESYONEL ÖZET');
        doc.font(fontR).fontSize(9).fillColor('#334155');
        doc.text(candidateProfile.summary.trim(), margin, currentY, {
          width: contentWidth,
          lineGap: 3,
          align: 'left'
        });
        currentY = doc.y + 12;
      }

      // 2. Eğitim Bilgileri
      if (candidateProfile.education && candidateProfile.education.trim()) {
        drawSectionHeader('EĞİTİM BİLGİLERİ');
        doc.font(fontR).fontSize(9).fillColor('#334155');
        doc.text(candidateProfile.education.trim(), margin, currentY, {
          width: contentWidth,
          lineGap: 3,
          align: 'left'
        });
        currentY = doc.y + 12;
      }

      // 3. Yetenekler & Uzmanlıklar
      if (candidateProfile.skills && candidateProfile.skills.trim()) {
        const skillList = candidateProfile.skills
          .split(/[,;\n]/)
          .map(s => s.trim())
          .filter(Boolean);

        if (skillList.length > 0) {
          drawSectionHeader('YETENEKLER & UZMANLIK ALANLARI');

          let pillX = margin;
          let pillY = currentY;
          const pillHeight = 18;

          skillList.forEach(skill => {
            const textWidth = doc.font(fontB).fontSize(8).widthOfString(skill);
            const pillWidth = textWidth + 14;

            if (pillX + pillWidth > pageWidth - margin) {
              pillX = margin;
              pillY += pillHeight + 5;
            }

            doc.roundedRect(pillX, pillY, pillWidth, pillHeight, 3).fillAndStroke('#f0fdf4', '#bbf7d0');
            doc.font(fontB).fontSize(8).fillColor('#166534');
            doc.text(skill, pillX, pillY + 4.5, { width: pillWidth, align: 'center', lineBreak: false });

            pillX += pillWidth + 6;
          });

          currentY = pillY + pillHeight + 12;
        }
      }

      // 4. Yabancı Diller
      if (candidateProfile.languages && candidateProfile.languages.trim()) {
        const langList = candidateProfile.languages
          .split(/[,;\n]/)
          .map(l => l.trim())
          .filter(Boolean);

        if (langList.length > 0) {
          drawSectionHeader('YABANCI DİLLER');

          let pillX = margin;
          let pillY = currentY;
          const pillHeight = 18;

          langList.forEach(langItem => {
            const textWidth = doc.font(fontB).fontSize(8).widthOfString(langItem);
            const pillWidth = textWidth + 14;

            if (pillX + pillWidth > pageWidth - margin) {
              pillX = margin;
              pillY += pillHeight + 5;
            }

            doc.roundedRect(pillX, pillY, pillWidth, pillHeight, 3).fillAndStroke('#f0f9ff', '#bae6fd');
            doc.font(fontB).fontSize(8).fillColor('#0369a1');
            doc.text(langItem, pillX, pillY + 4.5, { width: pillWidth, align: 'center', lineBreak: false });

            pillX += pillWidth + 6;
          });

          currentY = pillY + pillHeight + 12;
        }
      }

      // 5. Sertifikalar
      if (candidateProfile.certificates && candidateProfile.certificates.trim()) {
        drawSectionHeader('SERTİFİKALAR & BELGELER');
        doc.font(fontR).fontSize(9).fillColor('#334155');
        doc.text(candidateProfile.certificates.trim(), margin, currentY, {
          width: contentWidth,
          lineGap: 3,
          align: 'left'
        });
        currentY = doc.y + 12;
      }

      // ==========================================
      // 4. WATERMARK & FOOTER (Applied to all pages)
      // ==========================================
      const range = doc.bufferedPageRange();
      const totalPages = range.count;

      for (let i = range.start; i < range.start + totalPages; i++) {
        doc.switchToPage(i);
        doc.page.margins.bottom = 0;

        // Watermark (Under text / background)
        doc.save();
        doc.opacity(0.045);
        doc.font(fontB).fontSize(52).fillColor('#0f172a');
        doc.rotate(-35, { origin: [pageWidth / 2, pageHeight / 2] });
        const wmText = 'CYPILAN.COM';
        const wmW = doc.widthOfString(wmText);
        doc.text(wmText, (pageWidth - wmW) / 2, (pageHeight - 50) / 2, { lineBreak: false });
        doc.restore();

        // Footer at bottom
        const footerY = pageHeight - 20;
        doc.strokeColor('#e2e8f0').lineWidth(0.6).moveTo(margin, footerY - 5).lineTo(pageWidth - margin, footerY - 5).stroke();

        const todayStr = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        doc.font(fontR).fontSize(7).fillColor('#94a3b8');
        doc.text('Bu özgeçmiş CYPILAN.COM Kariyer Portalı üzerinden dijital olarak oluşturulmuştur.', margin, footerY, { lineBreak: false });

        const pageStr = `Tarih: ${todayStr}  •  Sayfa ${i + 1} / ${totalPages}`;
        const pageStrW = doc.widthOfString(pageStr);
        doc.text(pageStr, pageWidth - margin - pageStrW, footerY, { lineBreak: false });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateCvPdf
};
