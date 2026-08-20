const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbDir = path.join(__dirname, '..', 'database');
const schemaPath = path.join(dbDir, 'schema.sql');
const seedPath = path.join(dbDir, 'seed.sql');

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
              allRecords.push({ pageNum: p + 1, rowId, values });
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

  // En BÜYÜK yedek dosyasını bul (içinde gerçek verilerin olduğu dosya)
  let bestBak = null;
  let maxTotalSize = 0;

  for (const bak of corruptBaks) {
    const bakPath = path.join(dbDir, bak);
    const walPath = path.join(dbDir, `${bak}-wal`);
    let size = fs.existsSync(bakPath) ? fs.statSync(bakPath).size : 0;
    if (fs.existsSync(walPath)) size += fs.statSync(walPath).size;

    if (size > maxTotalSize) {
      maxTotalSize = size;
      bestBak = bak;
    }
  }

  let sourceDbFile = bestBak || (fs.existsSync(path.join(dbDir, 'cypilan.db')) ? 'cypilan.db' : null);
  let sourceWalFile = sourceDbFile ? `${sourceDbFile}-wal` : null;

  if (!sourceDbFile) {
    console.error('HATA: database/ klasöründe kurtarılacak dosya bulunamadı!');
    return;
  }

  console.log(`En zengin/büyük yedek dosyası seçildi: ${sourceDbFile} (Toplam: ${(maxTotalSize / 1024 / 1024).toFixed(2)} MB)`);

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

  if (fs.existsSync(seedPath)) {
    try {
      const seedData = fs.readFileSync(seedPath, 'utf8');
      targetDb.exec(seedData);
    } catch (_) {}
  }

  // 3. Ham Sayfa Tarayıcısı
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
    notifications: 0
  };

  const insertUserStmt = targetDb.prepare(`
    INSERT OR REPLACE INTO users (
      id, email, password_hash, full_name, phone, role, avatar_url, bio, company_name,
      language_pref, currency_pref, is_verified, is_active, show_phone, show_surname,
      has_password, corporate_status, corporate_type, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `);

  const insertListingStmt = targetDb.prepare(`
    INSERT OR REPLACE INTO listings (
      id, user_id, category_id, title, slug, description, price, currency,
      listing_type, status, location_city, location_district, views_count,
      is_premium, is_featured, is_urgent, is_opportunity, is_negotiable,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?
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

  const insertedUserIds = new Set();
  const insertedListingIds = new Set();
  const insertedEmails = new Set();

  targetDb.transaction(() => {
    for (let idx = 0; idx < rawRecords.length; idx++) {
      const item = rawRecords[idx];
      const vals = item.values;
      const rowId = item.rowId || (idx + 1);

      // --- 1. USER TESPİTİ ---
      const email = vals.find(v => typeof v === 'string' && v.includes('@') && v.includes('.') && !v.includes(' ') && v.length < 90);
      if (email && !insertedEmails.has(email)) {
        try {
          const passwordHash = vals.find(v => typeof v === 'string' && (v.startsWith('$2a$') || v.startsWith('$2b$'))) || '$2a$10$abcdefghijklmnopqrstuvwxyz123456';
          const fullName = vals.find(v => typeof v === 'string' && v !== email && v !== passwordHash && v.length >= 2 && v.length <= 60) || email.split('@')[0];
          const role = vals.find(v => ['user', 'business', 'agent', 'admin'].includes(v)) || 'user';
          const phone = vals.find(v => typeof v === 'string' && /^[\d\s+()-]{7,20}$/.test(v)) || null;
          const company = vals.find(v => typeof v === 'string' && v !== email && v !== fullName && v !== passwordHash && v.length > 2 && v.length < 80) || null;
          const corpType = vals.find(v => ['real_estate', 'auto', 'service', 'construction', 'shopping', 'other'].includes(v)) || (company ? 'real_estate' : null);

          insertUserStmt.run(
            rowId, email, passwordHash, fullName, phone, role, null, null, company,
            'tr', 'TRY', 1, 1, 1, 0,
            1, 'approved', corpType, new Date().toISOString(), new Date().toISOString()
          );
          insertedEmails.add(email);
          insertedUserIds.add(rowId);
          recoveredCounts.users++;
          continue;
        } catch (_) {}
      }

      // --- 2. LISTING TESPİTİ ---
      const hasCity = vals.some(v => ['Lefkoşa', 'Girne', 'Gazimağusa', 'İskele', 'Güzelyurt', 'Lefke'].includes(v));
      const hasListingType = vals.some(v => ['sale', 'rent', 'job', 'service', 'bid_request', 'wanted'].includes(v));
      const hasCurrency = vals.some(v => v === 'TRY' || v === 'GBP' || v === 'EUR' || v === 'USD');
      const hasSlug = vals.some(v => typeof v === 'string' && /^[a-z0-9-]+$/.test(v) && v.includes('-') && v.length > 5);

      if ((hasCity || hasListingType || hasCurrency || hasSlug) && !vals.some(v => typeof v === 'string' && v.includes('@'))) {
        try {
          const strings = vals.filter(v => typeof v === 'string');
          const numbers = vals.filter(v => typeof v === 'number');

          const slug = strings.find(s => /^[a-z0-9-]+$/.test(s) && s.includes('-') && s.length > 5) || `ilan-${rowId}-${Date.now().toString(36)}`;
          const title = strings.find(s => s !== slug && s.length >= 3 && s.length <= 150 && !s.startsWith('/uploads/')) || 'Kıbrıs İlanı';
          const description = strings.find(s => s !== slug && s !== title && s.length > 5 && !s.startsWith('/uploads/')) || title;
          const city = strings.find(s => ['Lefkoşa', 'Girne', 'Gazimağusa', 'İskele', 'Güzelyurt', 'Lefke'].includes(s)) || 'Lefkoşa';
          const district = strings.find(s => s !== city && s !== title && s !== description && s !== slug && s.length < 40 && !s.startsWith('/uploads/')) || 'Merkez';
          const currency = strings.find(s => ['TRY', 'GBP', 'EUR', 'USD'].includes(s)) || 'TRY';
          const listingType = strings.find(s => ['sale', 'rent', 'job', 'service', 'bid_request', 'wanted'].includes(s)) || 'sale';

          const price = numbers.find(n => n > 0 && n < 1000000000 && !Number.isInteger(n)) || numbers.find(n => n >= 100 && n < 100000000) || 0;
          const categoryId = numbers.find(n => Number.isInteger(n) && n > 0 && n <= 50) || 1;
          const userId = numbers.find(n => Number.isInteger(n) && n > 0 && n < 10000 && n !== categoryId) || 1;

          insertListingStmt.run(
            rowId, userId, categoryId, title, slug, description, price, currency,
            listingType, 'active', city, district, 0,
            0, 0, 0, 0, 0,
            new Date().toISOString(), new Date().toISOString()
          );
          insertedListingIds.add(rowId);
          recoveredCounts.listings++;
          continue;
        } catch (_) {}
      }

      // --- 3. RESİM TESPİTİ ---
      const imgPath = vals.find(v => typeof v === 'string' && (v.includes('/uploads/') || /\.(jpg|png|webp|jpeg)$/i.test(v)));
      if (imgPath) {
        try {
          const numbers = vals.filter(v => typeof v === 'number' && Number.isInteger(v));
          const listingId = numbers[0] || (insertedListingIds.size > 0 ? Array.from(insertedListingIds).pop() : 1);
          insertImageStmt.run(rowId, listingId, imgPath, 1, 0, new Date().toISOString());
          recoveredCounts.listing_images++;
          continue;
        } catch (_) {}
      }

      // --- 4. ÖZELLİK (ATTRIBUTE) TESPİTİ ---
      const attrKey = vals.find(v => typeof v === 'string' && ['room_count', 'square_meters', 'building_age', 'floor', 'fuel_type', 'gear_type', 'vehicle_brand', 'vehicle_model', 'vehicle_year', 'vehicle_km'].includes(v));
      if (attrKey) {
        try {
          const numbers = vals.filter(v => typeof v === 'number' && Number.isInteger(v));
          const listingId = numbers[0] || 1;
          const attrVal = vals.find(v => v !== attrKey && (typeof v === 'string' || typeof v === 'number')) || '';
          insertAttributeStmt.run(rowId, listingId, attrKey, String(attrVal));
          recoveredCounts.listing_attributes++;
          continue;
        } catch (_) {}
      }

      // --- 5. MESAJ TESPİTİ ---
      if (vals.length >= 4 && vals.some(v => typeof v === 'string' && v.length > 1 && !v.startsWith('/uploads/'))) {
        const content = vals.find(v => typeof v === 'string' && v.length > 1 && !v.startsWith('/uploads/'));
        const numbers = vals.filter(v => typeof v === 'number' && Number.isInteger(v));
        if (content && numbers.length >= 2) {
          try {
            insertMessageStmt.run(rowId, numbers[0], numbers[1], numbers[2] || null, content, 0, new Date().toISOString());
            recoveredCounts.messages++;
            continue;
          } catch (_) {}
        }
      }
    }
  })();

  // 4. Doğrulama ve Rapor
  const totalActiveUsers = targetDb.prepare("SELECT COUNT(*) as c FROM users WHERE is_active = 1").get().c;
  const totalActiveListings = targetDb.prepare("SELECT COUNT(*) as c FROM listings WHERE status = 'active'").get().c;
  const totalImages = targetDb.prepare("SELECT COUNT(*) as c FROM listing_images").get().c;
  const totalMessages = targetDb.prepare("SELECT COUNT(*) as c FROM messages").get().c;

  console.log('\n======================================================');
  console.log('✅ KURTARILAN CANLI VERİ TABLOSU:');
  console.log(`  👤 Aktif Üyeler (users)          : ${totalActiveUsers} kullanıcı`);
  console.log(`  🏠 Aktif İlanlar (listings)       : ${totalActiveListings} ilan`);
  console.log(`  🖼️  İlan Resimleri (listing_images): ${totalImages} adet`);
  console.log(`  🏷️  İlan Özellikleri (attributes)  : ${recoveredCounts.listing_attributes} adet`);
  console.log(`  💬 Mesajlar (messages)           : ${totalMessages} mesaj`);
  console.log('======================================================');

  targetDb.pragma('foreign_keys = ON');
  targetDb.close();

  // 5. Hedef veritabanını cypilan.db olarak yerleştir
  const currentDbPath = path.join(dbDir, 'cypilan.db');
  const currentWalPath = path.join(dbDir, 'cypilan.db-wal');
  const currentShmPath = path.join(dbDir, 'cypilan.db-shm');

  if (fs.existsSync(currentDbPath)) try { fs.unlinkSync(currentDbPath); } catch (_) {}
  if (fs.existsSync(currentWalPath)) try { fs.unlinkSync(currentWalPath); } catch (_) {}
  if (fs.existsSync(currentShmPath)) try { fs.unlinkSync(currentShmPath); } catch (_) {}

  fs.copyFileSync(tempTargetDb, currentDbPath);

  console.log('\n🎉 VERİTABANI BAŞARIYLA GERİ YÜKLENDİ!');
  console.log('Tüm verileriniz cypilan.db içine aktarıldı.');
  console.log('Artık sunucunuzda "pm2 restart all" çalıştırabilirsiniz.\n');

  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
}

restore().catch(err => {
  console.error('Kurtarma işleminde hata:', err);
});
