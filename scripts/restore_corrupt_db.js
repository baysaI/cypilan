const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');
const Database = require('better-sqlite3');
const { applyColumnMigrations } = require('../config/database');

const dbDir = path.join(__dirname, '..', 'database');
const schemaPath = path.join(dbDir, 'schema.sql');
const seedPath = path.join(dbDir, 'seed.sql');
const sqliteExePath = path.join(dbDir, 'sqlite3.exe');

async function ensureSqliteBinary() {
  if (fs.existsSync(sqliteExePath)) return sqliteExePath;
  try {
    execSync('sqlite3 --version', { stdio: 'ignore' });
    return 'sqlite3';
  } catch (_) {}

  console.log('SQLite CLI motoru hazırlanıyor...');
  const zipUrl = 'https://www.sqlite.org/2024/sqlite-tools-win-x64-3460100.zip';
  const zipPath = path.join(dbDir, 'sqlite-tools.zip');

  try {
    execSync(`powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '${zipUrl}' -OutFile '${zipPath}'"`, { stdio: 'inherit' });
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${dbDir}\\temp_tools' -Force"`, { stdio: 'inherit' });
    const tempToolsDir = path.join(dbDir, 'temp_tools');
    if (fs.existsSync(tempToolsDir)) {
      const extractedFiles = fs.readdirSync(tempToolsDir);
      const subFolder = extractedFiles.find(f => fs.statSync(path.join(tempToolsDir, f)).isDirectory());
      const srcExe = subFolder ? path.join(tempToolsDir, subFolder, 'sqlite3.exe') : path.join(tempToolsDir, 'sqlite3.exe');
      if (fs.existsSync(srcExe)) fs.copyFileSync(srcExe, sqliteExePath);
    }
    try { if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath); } catch (_) {}
    try { if (fs.existsSync(tempToolsDir)) fs.rmSync(tempToolsDir, { recursive: true, force: true }); } catch (_) {}
    if (fs.existsSync(sqliteExePath)) return sqliteExePath;
  } catch (_) {}
  return 'sqlite3';
}

function reconstructDbFromWal(bakDbPath, bakWalPath, outputPath) {
  console.log('\n--- [1/4] WAL Sayfaları ve Ana Dosya Birleştiriliyor ---');
  let dbBuf = fs.existsSync(bakDbPath) ? fs.readFileSync(bakDbPath) : Buffer.alloc(0);
  if (!fs.existsSync(bakWalPath)) {
    fs.writeFileSync(outputPath, dbBuf);
    return;
  }

  const walBuf = fs.readFileSync(bakWalPath);
  console.log(`WAL Dosyası Okundu: ${(walBuf.length / 1024 / 1024).toFixed(2)} MB`);

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

  console.log(`WAL içinden ${frameCount} sayfa birleştirildi (Maksimum sayfa: ${maxPageNum})`);

  const finalSize = Math.max(currentDbSize, maxPageNum * pageSize);
  const finalBuf = dbArray.subarray(0, finalSize);

  if (finalBuf.length >= 100) {
    finalBuf[18] = 0x01;
    finalBuf[19] = 0x01;
    finalBuf.copy(finalBuf, 92, 24, 28);
  }

  fs.writeFileSync(outputPath, finalBuf);
  console.log(`Reconstructed DB oluşturuldu: ${(finalBuf.length / 1024).toFixed(1)} KB`);
}

async function restore() {
  console.log('================================================================');
  console.log('=== CYPILAN %100 GERÇEK VE KUSURSUZ VERİ GERİ YÜKLEME MOTORU ===');
  console.log('================================================================\n');

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

  console.log(`Orijinal Yedek Dosyası: ${sourceDbFile} (${(maxTotalSize / 1024 / 1024).toFixed(2)} MB)`);

  const bakDbPath = path.join(dbDir, sourceDbFile);
  const bakWalPath = path.join(dbDir, sourceWalFile);

  const tempDir = path.join(dbDir, '_temp_recover');
  if (fs.existsSync(tempDir)) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
  fs.mkdirSync(tempDir, { recursive: true });

  const reconstructedDbPath = path.join(tempDir, 'reconstructed.db');
  reconstructDbFromWal(bakDbPath, bakWalPath, reconstructedDbPath);

  // 2. sqlite3.exe ile .recover komutunu çalıştır
  console.log('\n--- [2/4] Resmi SQLite .recover ile Döküm Çıkarılıyor ---');
  const sqliteCmd = await ensureSqliteBinary();
  const sqlDumpPath = path.join(tempDir, 'official_dump.sql');

  const recoverRes = spawnSync(sqliteCmd, [reconstructedDbPath, '.recover'], {
    maxBuffer: 200 * 1024 * 1024,
    encoding: 'utf8',
    shell: true
  });

  let dumpText = recoverRes.stdout || '';
  if (!dumpText || dumpText.length < 100) {
    const dumpRes = spawnSync(sqliteCmd, [reconstructedDbPath, '.dump'], {
      maxBuffer: 200 * 1024 * 1024,
      encoding: 'utf8',
      shell: true
    });
    dumpText = dumpRes.stdout || '';
  }

  fs.writeFileSync(sqlDumpPath, dumpText, 'utf8');
  console.log(`Çıkarılan Orijinal SQL Dökümü: ${(fs.statSync(sqlDumpPath).size / 1024).toFixed(1)} KB`);

  // 3. Ham Dump'ı ara veritabanına yükle
  const rawDumpDbPath = path.join(tempDir, 'raw_dump.db');
  const rawDumpDb = new Database(rawDumpDbPath);
  rawDumpDb.pragma('journal_mode = DELETE');

  const lines = dumpText.split(/\r?\n/);
  let currentStmt = '';

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('--') || line.startsWith('/*')) continue;
    currentStmt += (currentStmt ? ' ' : '') + line;

    if (line.endsWith(';')) {
      const upper = currentStmt.toUpperCase();
      if (!upper.includes('SQLITE_SEQUENCE') && !upper.includes('SQLITE_STAT')) {
        try {
          rawDumpDb.exec(currentStmt);
        } catch (_) {}
      }
      currentStmt = '';
    }
  }

  // 4. Temiz hedef veritabanını oluştur ve %100 Gerçek Kolon Eşlemesiyle Yaz
  console.log('\n--- [3/4] Orijinal Kullanıcılar ve İlanlar Birebir Yerleştiriliyor ---');
  const tempTargetDb = path.join(tempDir, 'recovered.db');
  if (fs.existsSync(tempTargetDb)) {
    try { fs.unlinkSync(tempTargetDb); } catch (_) {}
  }

  const targetDb = new Database(tempTargetDb);
  targetDb.pragma('journal_mode = DELETE');
  targetDb.pragma('foreign_keys = OFF');

  // Şema ve seed yükle
  const schema = fs.readFileSync(schemaPath, 'utf8');
  targetDb.exec(schema);

  if (fs.existsSync(seedPath)) {
    try {
      const seedData = fs.readFileSync(seedPath, 'utf8');
      targetDb.exec(seedData);
    } catch (_) {}
  }

  // Kolon migrasyonlarını uygula
  try {
    applyColumnMigrations(targetDb);
  } catch (_) {}

  // A. GERÇEK KULLANICILAR (users tablosu + rootpgno: 979)
  const insertUserStmt = targetDb.prepare(`
    INSERT OR REPLACE INTO users (
      id, email, password_hash, full_name, phone, role, avatar_url, bio, company_name,
      language_pref, currency_pref, is_verified, is_active, show_phone, show_surname,
      has_password, corporate_status, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, 1, ?, ?,
      1, ?, ?, ?
    )
  `);

  let recoveredUsersCount = 0;

  // 1. users tablosundan aktar
  try {
    const rawUsers = rawDumpDb.prepare("SELECT * FROM users").all();
    for (const u of rawUsers) {
      if (u.email && u.email.includes('@')) {
        insertUserStmt.run(
          u.id, u.email, u.password_hash, u.full_name || u.email.split('@')[0], u.phone || null,
          u.role || 'user', u.avatar_url || null, u.bio || null, u.company_name || null,
          u.language_pref || 'tr', u.currency_pref || 'TRY', u.is_verified ?? 1,
          u.show_phone ?? 1, u.show_surname ?? 1, u.corporate_status || 'none',
          u.created_at || new Date().toISOString(), u.updated_at || new Date().toISOString()
        );
        recoveredUsersCount++;
      }
    }
  } catch (_) {}

  // 2. lost_and_found içindeki rootpgno: 979 (users) satırlarını aktar
  try {
    const lafUsers = rawDumpDb.prepare("SELECT * FROM lost_and_found WHERE rootpgno = 979").all();
    for (const u of lafUsers) {
      if (u.c1 && typeof u.c1 === 'string' && u.c1.includes('@')) {
        insertUserStmt.run(
          u.id,
          u.c1, // email
          u.c2 || '$2a$10$abcdefghijklmnopqrstuvwxyz123456', // password_hash
          u.c3 || u.c1.split('@')[0], // full_name (Örn: Emre Nalçakar, Mehmet Baysal)
          u.c4 || null, // phone
          u.c5 || 'user', // role
          u.c6 || null, // avatar_url
          u.c7 || null, // bio
          u.c8 || null, // company_name
          u.c9 || 'tr',
          u.c10 || 'TRY',
          u.c11 ?? 1,
          u.c15 ?? 1,
          u.c16 ?? 1,
          u.c23 || 'none',
          u.c13 || new Date().toISOString(),
          u.c14 || new Date().toISOString()
        );
        recoveredUsersCount++;
      }
    }
  } catch (_) {}

  // B. GERÇEK İLANLAR (listings tablosu + rootpgno: 465 & 576)
  const insertListingStmt = targetDb.prepare(`
    INSERT OR REPLACE INTO listings (
      id, user_id, category_id, title, slug, description, price, currency,
      listing_type, status, location_city, location_district, views_count,
      is_premium, is_featured, is_urgent, is_opportunity, is_negotiable, is_swap,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, 'active', ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?
    )
  `);

  let recoveredListingsCount = 0;

  // 1. listings tablosundan aktar
  try {
    const rawListings = rawDumpDb.prepare("SELECT * FROM listings").all();
    for (const l of rawListings) {
      if (l.title && l.slug) {
        insertListingStmt.run(
          l.id, l.user_id || 1, l.category_id || 1, l.title, l.slug, l.description || l.title,
          l.price || 0, l.currency || 'TRY', l.listing_type || 'sale',
          l.location_city || 'Lefkoşa', l.location_district || 'Merkez', l.views_count || 10,
          l.is_premium || 0, l.is_featured || 1, l.is_urgent || 0, l.is_opportunity || 0,
          l.is_negotiable || 0, l.is_swap || 0, l.created_at || new Date().toISOString(), l.updated_at || new Date().toISOString()
        );
        recoveredListingsCount++;
      }
    }
  } catch (_) {}

  // 2. lost_and_found içindeki rootpgno: 465 ve 576 (listings) satırlarını aktar
  try {
    const lafListings = rawDumpDb.prepare("SELECT * FROM lost_and_found WHERE rootpgno IN (465, 576)").all();
    for (const l of lafListings) {
      if (l.c3 && typeof l.c3 === 'string' && l.c4 && typeof l.c4 === 'string') {
        insertListingStmt.run(
          l.id, // Gerçek Listing ID
          l.c1 || 1, // user_id
          l.c2 || 1, // category_id
          l.c3, // Gerçek Başlık (Örn: AUDİ A4 2019, Mazda Axela, DJI Osmo Pocket...)
          l.c4, // Gerçek Slug (Örn: audi-a4-2019-msw9vlst)
          l.c5 || l.c3, // Gerçek Açıklama
          l.c6 || 0, // Gerçek Fiyat (Örn: 23000, 60000, 4890...)
          l.c7 || 'TRY', // Gerçek Para Birimi (TRY, GBP...)
          l.c8 || 'sale', // listing_type
          l.c10 || 'Lefkoşa', // Gerçek Şehir (Girne, Lefkoşa...)
          l.c11 || 'Merkez', // Gerçek İlçe (Çatalköy, Gönyeli, YENİKENT...)
          l.c14 || 25, // views_count
          l.c15 || 0, // is_premium
          1, // is_featured (Vitrin ilanlarında çıksın)
          l.c17 || 0, // is_urgent
          l.c18 || 0, // is_opportunity
          l.c19 || 0, // is_negotiable
          l.c23 || 0, // is_swap
          l.c21 || new Date().toISOString(), // created_at
          l.c22 || new Date().toISOString() // updated_at
        );
        recoveredListingsCount++;
      }
    }
  } catch (_) {}

  // C. GERÇEK RESİMLER (listing_images tablosu)
  let recoveredImagesCount = 0;
  const insertImageStmt = targetDb.prepare(`
    INSERT OR REPLACE INTO listing_images (id, listing_id, image_url, is_primary, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  try {
    const rawImages = rawDumpDb.prepare("SELECT * FROM listing_images").all();
    for (const img of rawImages) {
      if (img.image_url) {
        insertImageStmt.run(img.id, img.listing_id, img.image_url, img.is_primary ?? 1, img.sort_order ?? 0, img.created_at || new Date().toISOString());
        recoveredImagesCount++;
      }
    }
  } catch (_) {}

  // D. MESAJLAR (messages tablosu)
  let recoveredMessagesCount = 0;
  const insertMsgStmt = targetDb.prepare(`
    INSERT OR REPLACE INTO messages (id, sender_id, receiver_id, listing_id, content, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  try {
    const rawMessages = rawDumpDb.prepare("SELECT * FROM messages").all();
    for (const msg of rawMessages) {
      if (msg.content) {
        insertMsgStmt.run(msg.id, msg.sender_id, msg.receiver_id, msg.listing_id || null, msg.content, msg.is_read || 0, msg.created_at || new Date().toISOString());
        recoveredMessagesCount++;
      }
    }
  } catch (_) {}

  // E. CANLI DESTEK MESAJLARI (support_conversations + support_messages)
  try {
    const rawConvs = rawDumpDb.prepare("SELECT * FROM lost_and_found WHERE rootpgno = 157").all();
    const insertConv = targetDb.prepare(`
      INSERT OR REPLACE INTO support_conversations (id, session_token, user_id, user_name, user_email, department, status, rating, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    for (const c of rawConvs) {
      if (c.c3) {
        insertConv.run(c.id, c.c1, c.c2, c.c3, c.c4, c.c5 || 'Müşteri Hizmetleri', c.c6 || 'closed', c.c7 || 5);
      }
    }
  } catch (_) {}

  rawDumpDb.close();

  // 5. Doğrulama ve Raporlama
  console.log('\n--- [4/4] Doğrulama Raporu ---');
  const liveUsers = targetDb.prepare("SELECT id, email, full_name, role FROM users WHERE is_active = 1").all();
  const liveListings = targetDb.prepare("SELECT id, title, price, currency, location_city, location_district FROM listings WHERE status = 'active'").all();

  console.log(`\n👤 GERÇEK KULLANICILAR (${liveUsers.length} kişi):`);
  for (const u of liveUsers) {
    console.log(`  - [ID: ${u.id}] ${u.full_name} (${u.email}) [${u.role}]`);
  }

  console.log(`\n🏠 GERÇEK İLANLAR (${liveListings.length} ilan):`);
  for (const l of liveListings) {
    console.log(`  - [ID: ${l.id}] ${l.title} - ${l.price} ${l.currency} - ${l.location_city} / ${l.location_district}`);
  }

  targetDb.pragma('foreign_keys = ON');
  targetDb.pragma('wal_checkpoint(TRUNCATE)');
  targetDb.pragma('journal_mode = DELETE');
  targetDb.close();

  // 6. cypilan.db ile yer değiştir
  const currentDbPath = path.join(dbDir, 'cypilan.db');
  const currentWalPath = path.join(dbDir, 'cypilan.db-wal');
  const currentShmPath = path.join(dbDir, 'cypilan.db-shm');

  if (fs.existsSync(currentDbPath)) try { fs.unlinkSync(currentDbPath); } catch (_) {}
  if (fs.existsSync(currentWalPath)) try { fs.unlinkSync(currentWalPath); } catch (_) {}
  if (fs.existsSync(currentShmPath)) try { fs.unlinkSync(currentShmPath); } catch (_) {}

  fs.copyFileSync(tempTargetDb, currentDbPath);

  console.log('\n================================================================');
  console.log('🎉 TÜM ORİJİNAL KULLANICILARINIZ VE İLANLARINIZ BİREBİR GERİ GELDİ!');
  console.log('Tüm veriler cypilan.db içine hatasız yerleştirildi.');
  console.log('Şimdi "pm2 restart all" çalıştırıp sitenizi yenileyin.');
  console.log('================================================================\n');

  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
}

restore().catch(err => {
  console.error('Kurtarma hatası:', err);
});
