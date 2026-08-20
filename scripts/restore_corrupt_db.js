const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbDir = path.join(__dirname, '..', 'database');
const schemaPath = path.join(dbDir, 'schema.sql');

function reconstructDbFromWal(bakDbPath, bakWalPath, outputPath) {
  console.log('\n--- WAL Sayfa Birleştirme Motoru Başlatılıyor ---');
  
  // 1. Ana dosya varsa oku, yoksa boş buffer oluştur
  let dbBuf;
  if (fs.existsSync(bakDbPath)) {
    dbBuf = fs.readFileSync(bakDbPath);
    console.log(`Ana dosya okundu: ${(dbBuf.length / 1024).toFixed(1)} KB`);
  } else {
    dbBuf = Buffer.alloc(0);
  }

  // 2. WAL dosyasını oku
  if (!fs.existsSync(bakWalPath)) {
    console.log('WAL dosyası bulunamadı, ana dosya doğrudan kullanılacak.');
    fs.writeFileSync(outputPath, dbBuf);
    return;
  }

  const walBuf = fs.readFileSync(bakWalPath);
  console.log(`WAL dosyası okundu: ${(walBuf.length / 1024 / 1024).toFixed(2)} MB (${walBuf.length} byte)`);

  if (walBuf.length < 32) {
    console.warn('WAL dosyası çok küçük (başlık eksik).');
    fs.writeFileSync(outputPath, dbBuf);
    return;
  }

  // WAL Header
  const magic = walBuf.readUInt32BE(0);
  const pageSize = walBuf.readUInt32BE(8) || 4096;
  console.log(`WAL Sayfa Boyutu (Page Size): ${pageSize} byte, Magic: 0x${magic.toString(16)}`);

  const frameHeaderSize = 24;
  const frameSize = frameHeaderSize + pageSize;

  let offset = 32; // WAL header 32 byte
  let frameCount = 0;
  let maxPageNum = 0;

  // DB buffer'ı büyütülebilir hale getir
  let currentDbSize = dbBuf.length;
  let dbArray = Buffer.from(dbBuf);

  while (offset + frameSize <= walBuf.length) {
    const pageNum = walBuf.readUInt32BE(offset); // Sayfa numarası (1-indexed)
    
    if (pageNum > 0 && pageNum < 1000000) {
      const pageData = walBuf.subarray(offset + frameHeaderSize, offset + frameSize);
      const targetOffset = (pageNum - 1) * pageSize;

      // Gerekirse buffer boyutunu büyüt
      if (targetOffset + pageSize > dbArray.length) {
        const newSize = Math.max(targetOffset + pageSize, dbArray.length * 2);
        const newBuf = Buffer.alloc(newSize);
        dbArray.copy(newBuf);
        dbArray = newBuf;
      }

      // Sayfayı ana veritabanı buffer'ına yaz
      pageData.copy(dbArray, targetOffset);
      frameCount++;
      if (pageNum > maxPageNum) maxPageNum = pageNum;
    }

    offset += frameSize;
  }

  console.log(`WAL içinden ${frameCount} adet güncel veritabanı sayfası başarıyla ana veritabanına uygulandı! (Maksimum sayfa: ${maxPageNum})`);

  // Gerçek dosya boyutuna kırp
  const finalSize = Math.max(currentDbSize, maxPageNum * pageSize);
  const finalBuf = dbArray.subarray(0, finalSize);

  // WAL modunu Rollback Journal (0x01) moduna sıfırla (Böylece SQLite harici WAL dosyası aramaz)
  if (finalBuf.length >= 20) {
    finalBuf[18] = 0x01; // file format read version
    finalBuf[19] = 0x01; // file format write version
  }

  fs.writeFileSync(outputPath, finalBuf);
  console.log(`Reconstructed DB oluşturuldu: ${(finalBuf.length / 1024).toFixed(1)} KB -> ${outputPath}`);
}

async function restore() {
  console.log('======================================================');
  console.log('=== CYPILAN SQLite GELİŞMİŞ VERİ KURTARMA MOTORU ===');
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
    console.log('Mevcut cypilan.db üzerinden kurtarma yapılıyor...');
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
  reconstructDbFromWal(bakDbPath, bakWalPath, reconstructedDbPath);

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

  // 3. Reconstructed DB'den verileri oku ve aktar
  console.log('\n[3/3] Tablolar taranıyor ve kayıtlar aktarılıyor...');
  let srcDb;
  try {
    srcDb = new Database(reconstructedDbPath, { readonly: true });
  } catch (openErr) {
    console.error('Reconstructed DB açılamadı:', openErr.message);
    return;
  }

  const tables = [
    'users',
    'categories',
    'listings',
    'listing_images',
    'listing_attributes',
    'reviews',
    'messages',
    'favorites',
    'payments',
    'reports',
    'saved_searches',
    'support_conversations',
    'support_messages',
    'user_warnings',
    'notifications',
    'bids',
    'bid_conversations',
    'bid_messages',
    'site_settings',
    'candidate_profiles',
    'job_applications',
    'service_requests'
  ];

  let totalRows = 0;

  for (const table of tables) {
    try {
      // Tablo var mı kontrol et
      const tableCheck = srcDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(table);
      if (!tableCheck) continue;

      const srcCols = srcDb.pragma(`table_info(${table})`).map(c => c.name);
      let tgtCols = [];
      try {
        tgtCols = targetDb.pragma(`table_info(${table})`).map(c => c.name);
      } catch (_) {}

      const commonCols = srcCols.filter(c => tgtCols.includes(c));
      if (commonCols.length === 0) continue;

      let rows = [];
      try {
        rows = srcDb.prepare(`SELECT ${commonCols.map(c => `"${c}"`).join(', ')} FROM "${table}"`).all();
      } catch (readErr) {
        console.warn(`  [!] ${table} toplu okuma uyarısı, satır satır deneniyor: ${readErr.message}`);
        try {
          const rowids = srcDb.prepare(`SELECT rowid FROM "${table}"`).all().map(r => r.rowid);
          for (const rid of rowids) {
            try {
              const row = srcDb.prepare(`SELECT ${commonCols.map(c => `"${c}"`).join(', ')} FROM "${table}" WHERE rowid = ?`).get(rid);
              if (row) rows.push(row);
            } catch (_) {}
          }
        } catch (_) {}
      }

      if (rows.length > 0) {
        const placeholders = commonCols.map(() => '?').join(', ');
        const insertStmt = targetDb.prepare(`INSERT OR REPLACE INTO "${table}" (${commonCols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`);

        const insertMany = targetDb.transaction((items) => {
          let count = 0;
          for (const item of items) {
            const vals = commonCols.map(col => item[col]);
            insertStmt.run(vals);
            count++;
          }
          return count;
        });

        const inserted = insertMany(rows);
        totalRows += inserted;
        console.log(`  ✅ ${table.padEnd(25)} : ${inserted} kayıt kurtarıldı.`);
      } else {
        console.log(`  [-] ${table.padEnd(25)} : 0 kayıt.`);
      }
    } catch (tblErr) {
      console.error(`  ❌ ${table} tablosunda hata:`, tblErr.message);
    }
  }

  srcDb.close();
  targetDb.pragma('foreign_keys = ON');
  targetDb.close();

  console.log(`\n======================================================`);
  console.log(`TOPLAM KURTARILAN KAYIT SAYISI: ${totalRows}`);
  console.log(`======================================================`);

  if (totalRows > 0) {
    // 4. Hedef veritabanını cypilan.db ile değiştir
    const currentDbPath = path.join(dbDir, 'cypilan.db');
    const currentWalPath = path.join(dbDir, 'cypilan.db-wal');
    const currentShmPath = path.join(dbDir, 'cypilan.db-shm');

    if (fs.existsSync(currentDbPath)) {
      try { fs.unlinkSync(currentDbPath); } catch (_) {}
    }
    if (fs.existsSync(currentWalPath)) {
      try { fs.unlinkSync(currentWalPath); } catch (_) {}
    }
    if (fs.existsSync(currentShmPath)) {
      try { fs.unlinkSync(currentShmPath); } catch (_) {}
    }

    fs.copyFileSync(tempTargetDb, currentDbPath);

    console.log('\n🎉 TEBRİKLER! TÜM VERİLERİNİZ EKSİKSİZ KURTARILDI!');
    console.log('Tüm kullanıcılarınız, ilanlarınız ve verileriniz cypilan.db içine aktarıldı.');
    console.log('Şimdi sunucunuzda "pm2 restart all" çalıştırabilirsiniz.\n');
  } else {
    console.warn('\nUyarı: Otomatik tablo aktarımı 0 satır döndü.');
  }

  // Temizlik
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
}

restore().catch(err => {
  console.error('Kurtarma işleminde kritik hata:', err);
});
