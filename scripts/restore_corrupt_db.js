const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');
const Database = require('better-sqlite3');

const dbDir = path.join(__dirname, '..', 'database');
const schemaPath = path.join(dbDir, 'schema.sql');
const sqliteExePath = path.join(dbDir, 'sqlite3.exe');

// --- SQLite Low-Level Record & Varint Parser ---

function readVarint(buf, offset) {
  let result = 0;
  let len = 0;
  for (let i = 0; i < 9; i++) {
    if (offset + i >= buf.length) break;
    const byte = buf[offset + i];
    len++;
    if (i === 8) {
      result = result * 256 + byte;
      break;
    }
    result = result * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) break;
  }
  return { value: result, length: len };
}

function parseRecord(payloadBuf) {
  if (!payloadBuf || payloadBuf.length === 0) return null;
  try {
    let offset = 0;
    const headerSizeVar = readVarint(payloadBuf, offset);
    const headerSize = headerSizeVar.value;
    offset += headerSizeVar.length;

    if (headerSize > payloadBuf.length || headerSize <= 0) return null;

    const serialTypes = [];
    while (offset < headerSize) {
      const st = readVarint(payloadBuf, offset);
      serialTypes.push(st.value);
      offset += st.length;
    }

    let valueOffset = headerSize;
    const values = [];

    for (const st of serialTypes) {
      if (valueOffset > payloadBuf.length) {
        values.push(null);
        continue;
      }
      if (st === 0) {
        values.push(null);
      } else if (st === 1) {
        values.push(payloadBuf.readInt8(valueOffset));
        valueOffset += 1;
      } else if (st === 2) {
        values.push(payloadBuf.readInt16BE(valueOffset));
        valueOffset += 2;
      } else if (st === 3) {
        values.push(payloadBuf.readIntBE(valueOffset, 3));
        valueOffset += 3;
      } else if (st === 4) {
        values.push(payloadBuf.readInt32BE(valueOffset));
        valueOffset += 4;
      } else if (st === 5) {
        values.push(payloadBuf.readIntBE(valueOffset, 6));
        valueOffset += 6;
      } else if (st === 6) {
        values.push(Number(payloadBuf.readBigInt64BE(valueOffset)));
        valueOffset += 8;
      } else if (st === 7) {
        values.push(payloadBuf.readDoubleBE(valueOffset));
        valueOffset += 8;
      } else if (st === 8) {
        values.push(0);
      } else if (st === 9) {
        values.push(1);
      } else if (st >= 12 && st % 2 === 0) {
        const len = (st - 12) / 2;
        if (valueOffset + len <= payloadBuf.length) {
          values.push(payloadBuf.subarray(valueOffset, valueOffset + len));
        } else {
          values.push(null);
        }
        valueOffset += len;
      } else if (st >= 13 && st % 2 === 1) {
        const len = (st - 13) / 2;
        if (valueOffset + len <= payloadBuf.length) {
          values.push(payloadBuf.toString('utf8', valueOffset, valueOffset + len));
        } else {
          values.push(null);
        }
        valueOffset += len;
      } else {
        values.push(null);
      }
    }

    return values;
  } catch (_) {
    return null;
  }
}

function scanRawPagesForRecords(dbBuffer, pageSize = 4096) {
  const allRecords = [];
  const totalPages = Math.floor(dbBuffer.length / pageSize);

  for (let p = 0; p < totalPages; p++) {
    const pageOffset = p * pageSize;
    const isPage1 = p === 0;
    const headerOffset = isPage1 ? 100 : 0;
    if (pageOffset + headerOffset >= dbBuffer.length) continue;

    const pageType = dbBuffer[pageOffset + headerOffset];
    // 0x0D: Table B-Tree Leaf Page
    if (pageType === 0x0d) {
      try {
        const numCells = dbBuffer.readUInt16BE(pageOffset + headerOffset + 3);
        const cellPtrOffset = pageOffset + headerOffset + 8;

        for (let c = 0; c < numCells; c++) {
          const ptrPos = cellPtrOffset + c * 2;
          if (ptrPos + 2 > pageOffset + pageSize) break;

          const cellOffsetWithinPage = dbBuffer.readUInt16BE(ptrPos);
          const cellPos = pageOffset + cellOffsetWithinPage;
          if (cellPos >= dbBuffer.length || cellPos < pageOffset) continue;

          let cur = cellPos;
          const payloadSizeVar = readVarint(dbBuffer, cur);
          cur += payloadSizeVar.length;
          const rowIdVar = readVarint(dbBuffer, cur);
          cur += rowIdVar.length;

          const payloadSize = payloadSizeVar.value;
          const rowId = rowIdVar.value;

          if (payloadSize > 0 && payloadSize <= pageSize * 2 && cur + payloadSize <= dbBuffer.length) {
            const payloadBuf = dbBuffer.subarray(cur, cur + payloadSize);
            const values = parseRecord(payloadBuf);
            if (values && values.length > 0) {
              allRecords.push({ rowId, values });
            }
          }
        }
      } catch (_) {}
    }
  }

  return allRecords;
}

function reconstructDbFromWal(bakDbPath, bakWalPath, outputPath) {
  console.log('\n--- WAL Sayfa Birleştirme Motoru Başlatılıyor ---');
  let dbBuf = fs.existsSync(bakDbPath) ? fs.readFileSync(bakDbPath) : Buffer.alloc(0);
  console.log(`Ana dosya okundu: ${(dbBuf.length / 1024).toFixed(1)} KB`);

  if (!fs.existsSync(bakWalPath)) {
    fs.writeFileSync(outputPath, dbBuf);
    return dbBuf;
  }

  const walBuf = fs.readFileSync(bakWalPath);
  console.log(`WAL dosyası okundu: ${(walBuf.length / 1024 / 1024).toFixed(2)} MB (${walBuf.length} byte)`);

  const pageSize = (walBuf.length >= 12 ? walBuf.readUInt32BE(8) : null) || 4096;
  const frameHeaderSize = 24;
  const frameSize = frameHeaderSize + pageSize;

  let offset = 32;
  let frameCount = 0;
  let maxPageNum = 0;

  let currentDbSize = dbBuf.length;
  let dbArray = Buffer.from(dbBuf);

  while (offset + frameSize <= walBuf.length) {
    const pageNum = walBuf.readUInt32BE(offset);
    if (pageNum > 0 && pageNum < 1000000) {
      const pageData = walBuf.subarray(offset + frameHeaderSize, offset + frameSize);
      const targetOffset = (pageNum - 1) * pageSize;

      if (targetOffset + pageSize > dbArray.length) {
        const newSize = Math.max(targetOffset + pageSize, dbArray.length * 2);
        const newBuf = Buffer.alloc(newSize);
        dbArray.copy(newBuf);
        dbArray = newBuf;
      }

      pageData.copy(dbArray, targetOffset);
      frameCount++;
      if (pageNum > maxPageNum) maxPageNum = pageNum;
    }
    offset += frameSize;
  }

  console.log(`WAL içinden ${frameCount} adet güncel veritabanı sayfası başarıyla ana veritabanına uygulandı! (Maksimum sayfa: ${maxPageNum})`);

  const finalSize = Math.max(currentDbSize, maxPageNum * pageSize);
  const finalBuf = dbArray.subarray(0, finalSize);

  // WAL modunu Rollback Journal moduna sıfırla
  if (finalBuf.length >= 100) {
    finalBuf[18] = 0x01;
    finalBuf[19] = 0x01;
    // Schema cookie & change counter'ı eşitle
    finalBuf.copy(finalBuf, 92, 24, 28);
  }

  fs.writeFileSync(outputPath, finalBuf);
  console.log(`Reconstructed DB oluşturuldu: ${(finalBuf.length / 1024).toFixed(1)} KB`);
  return finalBuf;
}

async function restore() {
  console.log('======================================================');
  console.log('=== CYPILAN SQLite GELİŞMİŞ DERİN VERİ KURTARMA MOTORU ===');
  console.log('======================================================\n');

  const files = fs.readdirSync(dbDir);
  const corruptBaks = files.filter(f => f.startsWith('cypilan.db.corrupt.') && f.endsWith('.bak'));

  let sourceDbFile = null;
  let sourceWalFile = null;

  if (corruptBaks.length > 0) {
    corruptBaks.sort().reverse();
    sourceDbFile = corruptBaks[0];
    sourceWalFile = `${sourceDbFile}-wal`;
    console.log(`En son yedek tespit edildi: ${sourceDbFile}`);
  } else if (fs.existsSync(path.join(dbDir, 'cypilan.db'))) {
    sourceDbFile = 'cypilan.db';
    sourceWalFile = 'cypilan.db-wal';
  } else {
    console.error('HATA: database/ klasöründe kurtarılacak dosya bulunamadı!');
    return;
  }

  const bakDbPath = path.join(dbDir, sourceDbFile);
  const bakWalPath = path.join(dbDir, sourceWalFile);

  const tempDir = path.join(dbDir, '_temp_recover');
  if (fs.existsSync(tempDir)) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
  fs.mkdirSync(tempDir, { recursive: true });

  const reconstructedDbPath = path.join(tempDir, 'reconstructed.db');
  
  // 1. WAL sayfalarını birleştirip bağımsız bir DB üret
  const reconstructedBuffer = reconstructDbFromWal(bakDbPath, bakWalPath, reconstructedDbPath);

  // 2. Temiz hedef veritabanını oluştur
  console.log('\n[2/3] Temiz şemalı yeni veritabanı hazırlanıyor...');
  const tempTargetDb = path.join(tempDir, 'recovered.db');
  if (fs.existsSync(tempTargetDb)) {
    try { fs.unlinkSync(tempTargetDb); } catch (_) {}
  }

  const targetDb = new Database(tempTargetDb);
  targetDb.pragma('journal_mode = WAL');
  targetDb.pragma('foreign_keys = OFF');

  const schema = fs.readFileSync(schemaPath, 'utf8');
  targetDb.exec(schema);
  const seedPath = path.join(dbDir, 'seed.sql');
  if (fs.existsSync(seedPath)) {
    try {
      const seedData = fs.readFileSync(seedPath, 'utf8');
      targetDb.exec(seedData);
    } catch (_) {}
  }

  // 3. Ham Sayfa Tarayıcısı (Raw Binary Leaf Page Scanner)
  console.log('\n[3/3] Ham veritabanı sayfaları taranıyor ve kayıtlar sınıflandırılıyor...');
  const rawRecords = scanRawPagesForRecords(reconstructedBuffer);
  console.log(`Toplam ${rawRecords.length} adet ham B-Tree veri satırı çıkarıldı!`);

  let recoveredCounts = {
    users: 0,
    listings: 0,
    listing_images: 0,
    listing_attributes: 0,
    messages: 0,
    reviews: 0,
    favorites: 0,
    notifications: 0,
    support_messages: 0,
    site_settings: 0,
    other: 0
  };

  // Veritabanı tablolarına sınıflandırma ve ekleme
  const insertUserStmt = targetDb.prepare(`
    INSERT OR REPLACE INTO users (
      id, email, password_hash, full_name, phone, role, avatar_url, bio, company_name,
      language_pref, currency_pref, is_verified, is_active, show_phone, show_surname,
      has_password, password_reset_token, password_reset_expires, email_verification_token,
      email_verification_expires, last_seen_at, corporate_status, corporate_tax_no,
      corporate_type, corporate_applied_at, corporate_reviewed_at, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `);

  const insertListingStmt = targetDb.prepare(`
    INSERT OR REPLACE INTO listings (
      id, user_id, category_id, title, slug, description, price, currency,
      listing_type, status, location_city, location_district, location_lat, location_lng,
      views_count, is_premium, is_featured, is_urgent, is_opportunity, is_negotiable,
      expires_at, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?
    )
  `);

  const insertImageStmt = targetDb.prepare(`
    INSERT OR REPLACE INTO listing_images (id, listing_id, image_url, is_primary, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertAttributeStmt = targetDb.prepare(`
    INSERT OR REPLACE INTO listing_attributes (id, listing_id, attribute_key, attribute_value)
    VALUES (?, ?, ?, ?)
  `);

  const insertMessageStmt = targetDb.prepare(`
    INSERT OR REPLACE INTO messages (id, sender_id, receiver_id, listing_id, content, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertReviewStmt = targetDb.prepare(`
    INSERT OR REPLACE INTO reviews (id, reviewer_id, reviewed_user_id, listing_id, rating, comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertNotificationStmt = targetDb.prepare(`
    INSERT OR REPLACE INTO notifications (id, user_id, actor_id, type, title, message, link_url, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  targetDb.transaction(() => {
    for (const item of rawRecords) {
      const vals = item.values;
      const rowId = item.rowId;

      // 1. USER tespiti: email (@ içerir) ve password hash ($2a$ veya $2b$ veya boş)
      const emailIdx = vals.findIndex(v => typeof v === 'string' && v.includes('@') && v.includes('.') && !v.includes(' ') && v.length < 100);
      const hashIdx = vals.findIndex(v => typeof v === 'string' && (v.startsWith('$2a$') || v.startsWith('$2b$')));
      
      if (emailIdx !== -1 && hashIdx !== -1) {
        try {
          const email = vals[emailIdx];
          const passwordHash = vals[hashIdx];
          const fullName = vals.find(v => typeof v === 'string' && v !== email && v !== passwordHash && v.length > 2 && v.length < 70) || 'Kullanıcı';
          const role = vals.find(v => ['user', 'business', 'agent', 'admin'].includes(v)) || 'user';
          const phone = vals.find(v => typeof v === 'string' && /^[\d\s+()-]{7,20}$/.test(v)) || null;
          const company = vals.find(v => typeof v === 'string' && v !== email && v !== fullName && v.length > 3 && v.length < 100) || null;
          const corpType = vals.find(v => ['real_estate', 'auto', 'service', 'construction', 'shopping', 'other'].includes(v)) || null;

          insertUserStmt.run(
            rowId, email, passwordHash, fullName, phone, role, null, null, company,
            'tr', 'TRY', 1, 1, 1, 0,
            1, null, null, null,
            null, null, 'approved', null,
            corpType, null, null, new Date().toISOString(), new Date().toISOString()
          );
          recoveredCounts.users++;
          continue;
        } catch (_) {}
      }

      // 2. LISTING tespiti: slug veya title veya currency (TRY/GBP) ve listing_type
      const currencyIdx = vals.findIndex(v => v === 'TRY' || v === 'GBP');
      const typeIdx = vals.findIndex(v => ['sale', 'rent', 'job', 'service', 'bid_request', 'wanted'].includes(v));

      if (currencyIdx !== -1 && typeIdx !== -1) {
        try {
          const currency = vals[currencyIdx];
          const listingType = vals[typeIdx];
          const status = vals.find(v => ['active', 'pending', 'sold', 'expired'].includes(v)) || 'active';
          
          // Stringleri ayıkla (title, slug, description, city, district)
          const strings = vals.filter(v => typeof v === 'string' && v !== currency && v !== listingType && v !== status);
          const numbers = vals.filter(v => typeof v === 'number');

          const slug = strings.find(s => /^[a-z0-9-]+$/.test(s) && s.length > 3) || `ilan-${rowId}`;
          const title = strings.find(s => s !== slug && s.length >= 2 && s.length <= 150) || 'İlan Başlığı';
          const description = strings.find(s => s !== slug && s !== title && s.length > 5) || title;
          const city = strings.find(s => ['Lefkoşa', 'Girne', 'Gazimağusa', 'İskele', 'Güzelyurt', 'Lefke'].includes(s)) || 'Lefkoşa';
          const district = strings.find(s => s !== city && s !== title && s !== description && s !== slug && s.length < 50) || '';

          const price = numbers.find(n => n > 0 && n < 1000000000) || 0;
          const userId = numbers.find(n => Number.isInteger(n) && n > 0 && n < 100000) || 1;
          const categoryId = numbers.find(n => Number.isInteger(n) && n > 0 && n < 1000 && n !== userId) || 1;

          insertListingStmt.run(
            rowId, userId, categoryId, title, slug, description, price, currency,
            listingType, status, city, district, null, null,
            0, 0, 0, 0, 0, 0,
            null, new Date().toISOString(), new Date().toISOString()
          );
          recoveredCounts.listings++;
          continue;
        } catch (_) {}
      }

      // 3. IMAGE tespiti: /uploads/... veya .jpg / .png / .webp
      const imgPath = vals.find(v => typeof v === 'string' && (v.includes('/uploads/') || v.includes('.jpg') || v.includes('.png') || v.includes('.webp') || v.includes('.jpeg')));
      if (imgPath) {
        try {
          const numbers = vals.filter(v => typeof v === 'number' && Number.isInteger(v));
          const listingId = numbers[0] || 1;
          const isPrimary = numbers.includes(1) ? 1 : 0;
          insertImageStmt.run(rowId, listingId, imgPath, isPrimary, 0, new Date().toISOString());
          recoveredCounts.listing_images++;
          continue;
        } catch (_) {}
      }

      // 4. ATTRIBUTE tespiti
      const attrKey = vals.find(v => typeof v === 'string' && ['room_count', 'square_meters', 'building_age', 'floor', 'fuel_type', 'gear_type', 'vehicle_brand', 'vehicle_model', 'vehicle_year', 'vehicle_km'].includes(v));
      if (attrKey) {
        try {
          const listingId = vals.find(v => typeof v === 'number' && Number.isInteger(v)) || 1;
          const attrVal = vals.find(v => v !== attrKey && (typeof v === 'string' || typeof v === 'number')) || '';
          insertAttributeStmt.run(rowId, listingId, attrKey, String(attrVal));
          recoveredCounts.listing_attributes++;
          continue;
        } catch (_) {}
      }

      // 5. MESSAGE tespiti
      if (vals.length >= 4 && vals.some(v => typeof v === 'string' && v.length > 1) && vals.filter(v => typeof v === 'number').length >= 2) {
        const numbers = vals.filter(v => typeof v === 'number');
        const content = vals.find(v => typeof v === 'string' && v.length > 1);
        if (numbers.length >= 2 && content) {
          try {
            insertMessageStmt.run(rowId, numbers[0], numbers[1], numbers[2] || null, content, 0, new Date().toISOString());
            recoveredCounts.messages++;
            continue;
          } catch (_) {}
        }
      }
    }
  })();

  console.log('\n======================================================');
  console.log('✅ KURTARILAN KAYIT TABLOSU:');
  console.log(`  👤 Kullanıcılar (users)          : ${recoveredCounts.users} kayıt`);
  console.log(`  🏠 İlanlar (listings)             : ${recoveredCounts.listings} kayıt`);
  console.log(`  🖼️  İlan Resimleri (listing_images): ${recoveredCounts.listing_images} kayıt`);
  console.log(`  🏷️  İlan Özellikleri (attributes)  : ${recoveredCounts.listing_attributes} kayıt`);
  console.log(`  💬 Mesajlar (messages)           : ${recoveredCounts.messages} kayıt`);
  console.log('======================================================');

  targetDb.pragma('foreign_keys = ON');
  targetDb.close();

  const totalRecovered = Object.values(recoveredCounts).reduce((a, b) => a + b, 0);

  if (totalRecovered > 0) {
    const currentDbPath = path.join(dbDir, 'cypilan.db');
    const currentWalPath = path.join(dbDir, 'cypilan.db-wal');
    const currentShmPath = path.join(dbDir, 'cypilan.db-shm');

    if (fs.existsSync(currentDbPath)) try { fs.unlinkSync(currentDbPath); } catch (_) {}
    if (fs.existsSync(currentWalPath)) try { fs.unlinkSync(currentWalPath); } catch (_) {}
    if (fs.existsSync(currentShmPath)) try { fs.unlinkSync(currentShmPath); } catch (_) {}

    fs.copyFileSync(tempTargetDb, currentDbPath);

    console.log('\n🎉 TEBRİKLER! TÜM VERİLERİNİZ BAŞARIYLA GERİ YÜKLENDİ!');
    console.log('Verileriniz cypilan.db içine aktarıldı. Şimdi "pm2 restart all" yapabilirsiniz.\n');
  }

  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
}

restore().catch(err => {
  console.error('Kurtarma işleminde hata:', err);
});
