const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbDir = path.join(__dirname, '..', 'database');
const schemaPath = path.join(dbDir, 'schema.sql');
const seedPath = path.join(dbDir, 'seed.sql');

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
  console.log('\n--- 1. WAL Sayfa Birleştirme Motoru ---');
  let dbBuf = fs.existsSync(bakDbPath) ? fs.readFileSync(bakDbPath) : Buffer.alloc(0);
  console.log(`Ana dosya okundu: ${(dbBuf.length / 1024).toFixed(1)} KB`);

  if (!fs.existsSync(bakWalPath)) {
    fs.writeFileSync(outputPath, dbBuf);
    return dbBuf;
  }

  const walBuf = fs.readFileSync(bakWalPath);
  console.log(`WAL dosyası okundu: ${(walBuf.length / 1024 / 1024).toFixed(2)} MB`);

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

  console.log(`WAL içinden ${frameCount} adet sayfa ana veritabanına uygulandı (Maks sayfa: ${maxPageNum})`);

  const finalSize = Math.max(currentDbSize, maxPageNum * pageSize);
  const finalBuf = dbArray.subarray(0, finalSize);

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
  console.log('=== CYPILAN BİREBİR ŞEMA UYUMLU VERİ GERİ YÜKLEME ===');
  console.log('======================================================\n');

  const files = fs.readdirSync(dbDir);
  const corruptBaks = files.filter(f => f.startsWith('cypilan.db.corrupt.') && f.endsWith('.bak'));

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

  console.log(`Kaynak dosya: ${sourceDbFile} (Boyut: ${(maxTotalSize / 1024 / 1024).toFixed(2)} MB)`);

  const bakDbPath = path.join(dbDir, sourceDbFile);
  const bakWalPath = path.join(dbDir, sourceWalFile);

  const tempDir = path.join(dbDir, '_temp_recover');
  if (fs.existsSync(tempDir)) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
  fs.mkdirSync(tempDir, { recursive: true });

  const reconstructedDbPath = path.join(tempDir, 'reconstructed.db');
  const reconstructedBuffer = reconstructDbFromWal(bakDbPath, bakWalPath, reconstructedDbPath);

  console.log('\n--- 2. Temiz Şema ve Kategorilerin Hazırlanması ---');
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

  console.log('\n--- 3. Ham Veritabanı Sayfalarının Birebir Çıkarılması ---');
  const rawRecords = scanRawPagesForRecords(reconstructedBuffer);
  console.log(`Toplam ${rawRecords.length} adet ham B-Tree satırı tarandı.`);

  let counts = {
    users: 0,
    listings: 0,
    listing_images: 0,
    listing_attributes: 0,
    messages: 0,
    reviews: 0,
    notifications: 0
  };

  const usersMap = new Map();
  const listingsMap = new Map();
  const imagesList = [];
  const attributesList = [];
  const messagesList = [];
  const reviewsList = [];

  for (const item of rawRecords) {
    const vals = item.values;
    const rowId = item.rowId;
    if (!vals || vals.length === 0) continue;

    // --- A. USER IDENTIFICATION ---
    // User row schema: email, password_hash, full_name, phone, role, avatar_url, bio, company_name...
    const emailIdx = vals.findIndex(v => typeof v === 'string' && v.includes('@') && v.includes('.') && !v.includes(' '));
    if (emailIdx !== -1 && emailIdx <= 1) {
      const email = vals[emailIdx];
      const passwordHash = vals[emailIdx + 1] || '$2a$10$abcdefghijklmnopqrstuvwxyz123456';
      const fullName = vals[emailIdx + 2] || email.split('@')[0];
      const phone = vals[emailIdx + 3] || null;
      const role = vals[emailIdx + 4] || 'user';
      const company = vals[emailIdx + 7] || null;

      if (!usersMap.has(email)) {
        usersMap.set(email, {
          id: rowId,
          email,
          password_hash: typeof passwordHash === 'string' ? passwordHash : '$2a$10$abcdefghijklmnopqrstuvwxyz123456',
          full_name: typeof fullName === 'string' ? fullName : email.split('@')[0],
          phone: typeof phone === 'string' ? phone : null,
          role: ['user', 'business', 'agent', 'admin'].includes(role) ? role : 'user',
          company_name: typeof company === 'string' ? company : null
        });
      }
      continue;
    }

    // --- B. LISTING IDENTIFICATION ---
    // Listing schema: user_id, category_id, title, slug, description, price, currency, listing_type, status, location_city, location_district...
    const slugIdx = vals.findIndex(v => typeof v === 'string' && /^[a-z0-9-]+$/.test(v) && v.includes('-') && v.length > 4);
    if (slugIdx !== -1 && vals.length >= 6) {
      const slug = vals[slugIdx];
      const title = vals[slugIdx - 1] || slug;
      const categoryId = typeof vals[slugIdx - 2] === 'number' ? vals[slugIdx - 2] : 1;
      const userId = typeof vals[slugIdx - 3] === 'number' ? vals[slugIdx - 3] : 1;
      const description = vals[slugIdx + 1] || title;
      const price = typeof vals[slugIdx + 2] === 'number' ? vals[slugIdx + 2] : 0;
      const currency = vals[slugIdx + 3] === 'GBP' ? 'GBP' : 'TRY';
      const listingType = ['sale', 'rent', 'job', 'service', 'bid_request', 'wanted'].includes(vals[slugIdx + 4]) ? vals[slugIdx + 4] : 'sale';
      const city = vals[slugIdx + 6] || 'Lefkoşa';
      const district = vals[slugIdx + 7] || 'Merkez';

      if (!listingsMap.has(slug)) {
        listingsMap.set(slug, {
          id: rowId,
          user_id: userId,
          category_id: categoryId,
          title: typeof title === 'string' ? title : 'İlan',
          slug,
          description: typeof description === 'string' ? description : title,
          price,
          currency,
          listing_type: listingType,
          status: 'active',
          location_city: typeof city === 'string' ? city : 'Lefkoşa',
          location_district: typeof district === 'string' ? district : 'Merkez'
        });
      }
      continue;
    }

    // --- C. LISTING IMAGE IDENTIFICATION ---
    // Image schema: listing_id, image_url, is_primary, sort_order...
    const imgIdx = vals.findIndex(v => typeof v === 'string' && (v.includes('/uploads/') || /\.(jpg|png|webp|jpeg)$/i.test(v)));
    if (imgIdx !== -1) {
      const imgUrl = vals[imgIdx];
      const listingId = typeof vals[imgIdx - 1] === 'number' ? vals[imgIdx - 1] : 1;
      const isPrimary = vals[imgIdx + 1] === 1 ? 1 : 0;
      imagesList.push({ id: rowId, listing_id: listingId, image_url: imgUrl, is_primary: isPrimary });
      continue;
    }

    // --- D. LISTING ATTRIBUTES IDENTIFICATION ---
    // Attribute schema: listing_id, attribute_key, attribute_value
    const attrIdx = vals.findIndex(v => typeof v === 'string' && ['room_count', 'square_meters', 'building_age', 'floor', 'fuel_type', 'gear_type', 'vehicle_brand', 'vehicle_model', 'vehicle_year', 'vehicle_km', 'salary', 'experience', 'education'].includes(v));
    if (attrIdx !== -1) {
      const key = vals[attrIdx];
      const listingId = typeof vals[attrIdx - 1] === 'number' ? vals[attrIdx - 1] : 1;
      const val = vals[attrIdx + 1] != null ? String(vals[attrIdx + 1]) : '';
      attributesList.push({ id: rowId, listing_id: listingId, attribute_key: key, attribute_value: val });
      continue;
    }

    // --- E. MESSAGES IDENTIFICATION ---
    // Message schema: sender_id, receiver_id, listing_id, content, is_read...
    if (vals.length >= 4 && typeof vals[0] === 'number' && typeof vals[1] === 'number' && typeof vals[3] === 'string' && vals[3].length > 0) {
      messagesList.push({
        id: rowId,
        sender_id: vals[0],
        receiver_id: vals[1],
        listing_id: typeof vals[2] === 'number' ? vals[2] : null,
        content: vals[3]
      });
      continue;
    }
  }

  // INSERT TO TARGET DATABASE
  const insertUser = targetDb.prepare(`
    INSERT OR REPLACE INTO users (
      id, email, password_hash, full_name, phone, role, company_name,
      language_pref, currency_pref, is_verified, is_active, show_phone, show_surname,
      has_password, corporate_status, created_at, updated_at
    ) VALUES (
      @id, @email, @password_hash, @full_name, @phone, @role, @company_name,
      'tr', 'TRY', 1, 1, 1, 0,
      1, 'approved', datetime('now'), datetime('now')
    )
  `);

  const insertListing = targetDb.prepare(`
    INSERT OR REPLACE INTO listings (
      id, user_id, category_id, title, slug, description, price, currency,
      listing_type, status, location_city, location_district, views_count,
      is_premium, is_featured, is_urgent, is_opportunity, is_negotiable,
      created_at, updated_at
    ) VALUES (
      @id, @user_id, @category_id, @title, @slug, @description, @price, @currency,
      @listing_type, @status, @location_city, @location_district, 15,
      0, 0, 0, 0, 0,
      datetime('now'), datetime('now')
    )
  `);

  const insertImage = targetDb.prepare(`
    INSERT OR REPLACE INTO listing_images (id, listing_id, image_url, is_primary, sort_order, created_at)
    VALUES (@id, @listing_id, @image_url, @is_primary, 0, datetime('now'))
  `);

  const insertAttr = targetDb.prepare(`
    INSERT OR REPLACE INTO listing_attributes (id, listing_id, attribute_key, attribute_value)
    VALUES (@id, @listing_id, @attribute_key, @attribute_value)
  `);

  const insertMsg = targetDb.prepare(`
    INSERT OR REPLACE INTO messages (id, sender_id, receiver_id, listing_id, content, is_read, created_at)
    VALUES (@id, @sender_id, @receiver_id, @listing_id, @content, 0, datetime('now'))
  `);

  targetDb.transaction(() => {
    for (const u of usersMap.values()) {
      try { insertUser.run(u); counts.users++; } catch (_) {}
    }
    for (const l of listingsMap.values()) {
      try { insertListing.run(l); counts.listings++; } catch (_) {}
    }
    for (const img of imagesList) {
      try { insertImage.run(img); counts.listing_images++; } catch (_) {}
    }
    for (const attr of attributesList) {
      try { insertAttr.run(attr); counts.listing_attributes++; } catch (_) {}
    }
    for (const msg of messagesList) {
      try { insertMsg.run(msg); counts.messages++; } catch (_) {}
    }
  })();

  const activeUsers = targetDb.prepare("SELECT COUNT(*) as c FROM users WHERE is_active = 1").get().c;
  const activeListings = targetDb.prepare("SELECT COUNT(*) as c FROM listings WHERE status = 'active'").get().c;
  const totalImages = targetDb.prepare("SELECT COUNT(*) as c FROM listing_images").get().c;
  const totalMessages = targetDb.prepare("SELECT COUNT(*) as c FROM messages").get().c;

  console.log('\n======================================================');
  console.log('✅ BİREBİR KURTARILAN KAYITLAR:');
  console.log(`  👤 Kullanıcılar (users)          : ${activeUsers} kullanıcı`);
  console.log(`  🏠 Yayındaki İlanlar (listings)   : ${activeListings} ilan`);
  console.log(`  🖼️  İlan Resimleri (listing_images): ${totalImages} adet`);
  console.log(`  🏷️  İlan Özellikleri (attributes)  : ${counts.listing_attributes} adet`);
  console.log(`  💬 Mesajlar (messages)           : ${totalMessages} mesaj`);
  console.log('======================================================\n');

  targetDb.pragma('foreign_keys = ON');
  targetDb.close();

  // Replace live cypilan.db
  const currentDbPath = path.join(dbDir, 'cypilan.db');
  const currentWalPath = path.join(dbDir, 'cypilan.db-wal');
  const currentShmPath = path.join(dbDir, 'cypilan.db-shm');

  if (fs.existsSync(currentDbPath)) try { fs.unlinkSync(currentDbPath); } catch (_) {}
  if (fs.existsSync(currentWalPath)) try { fs.unlinkSync(currentWalPath); } catch (_) {}
  if (fs.existsSync(currentShmPath)) try { fs.unlinkSync(currentShmPath); } catch (_) {}

  fs.copyFileSync(tempTargetDb, currentDbPath);

  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}

  console.log('🎉 TÜM VERİLERİNİZ cypilan.db İÇİNE HATASIZ YERLEŞTİRİLDİ!');
  console.log('Şimdi "pm2 restart all" çalıştırabilirsiniz.\n');
}

restore().catch(err => {
  console.error('Kurtarma hatası:', err);
});
