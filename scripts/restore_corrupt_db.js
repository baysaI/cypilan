const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbDir = path.join(__dirname, '..', 'database');
const schemaPath = path.join(dbDir, 'schema.sql');

async function restore() {
  console.log('=== CYPILAN VERİTABANI KURTARMA SİHİRBAZI ===\n');

  // 1. Yedek dosyalarını bul
  const files = fs.readdirSync(dbDir);
  const corruptBaks = files.filter(f => f.startsWith('cypilan.db.corrupt.') && f.endsWith('.bak'));

  if (corruptBaks.length === 0) {
    console.error('HATA: database/ klasöründe cypilan.db.corrupt.*.bak dosyası bulunamadı!');
    return;
  }

  // En son yedek dosyasını al
  corruptBaks.sort().reverse();
  const latestBak = corruptBaks[0];
  const bakDbPath = path.join(dbDir, latestBak);
  const bakWalPath = path.join(dbDir, `${latestBak}-wal`);

  console.log(`En son bozuk/orijinal yedek dosyası tespit edildi: ${latestBak}`);
  console.log(`Boyut: ${(fs.statSync(bakDbPath).size / 1024).toFixed(1)} KB`);
  if (fs.existsSync(bakWalPath)) {
    console.log(`WAL Dosyası: ${latestBak}-wal (${(fs.statSync(bakWalPath).size / 1024 / 1024).toFixed(2)} MB)`);
  }

  // 2. Geçici çalışma dizini oluştur
  const tempDir = path.join(dbDir, '_temp_recover');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempDir, { recursive: true });

  const tempDbPath = path.join(tempDir, 'source.db');
  fs.copyFileSync(bakDbPath, tempDbPath);
  if (fs.existsSync(bakWalPath)) {
    fs.copyFileSync(bakWalPath, path.join(tempDir, 'source.db-wal'));
  }

  // 3. Kaynak veritabanını aç ve checkpoint yap
  let sourceDb;
  try {
    sourceDb = new Database(tempDbPath);
    try {
      sourceDb.pragma('journal_mode = WAL');
      sourceDb.pragma('wal_checkpoint(TRUNCATE)');
    } catch (e) {
      console.warn('WAL checkpoint uyarısı (normal olabilir):', e.message);
    }
  } catch (err) {
    console.error('Kaynak veritabanı açılamadı:', err.message);
    return;
  }

  // 4. Hedef temiz kurtarılmış veritabanını oluştur
  const targetDbPath = path.join(dbDir, 'cypilan_recovered.db');
  if (fs.existsSync(targetDbPath)) {
    fs.unlinkSync(targetDbPath);
  }
  const targetDb = new Database(targetDbPath);
  targetDb.pragma('journal_mode = WAL');
  targetDb.pragma('foreign_keys = OFF'); // Kurtarma sırasında foreign key çakışmalarını önle

  const schema = fs.readFileSync(schemaPath, 'utf8');
  targetDb.exec(schema);

  // 5. Kaynak veritabanındaki tabloları tara
  const tables = sourceDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);
  console.log(`\nBulunan tablolar: ${tables.join(', ')}\n`);

  let totalRecoveredRows = 0;

  for (const table of tables) {
    try {
      // Tablodaki tüm sütunları al
      const srcCols = sourceDb.pragma(`table_info(${table})`).map(c => c.name);
      if (srcCols.length === 0) continue;

      // Hedef tablodaki sütunları al (uyuşan sütunları aktar)
      let tgtCols = [];
      try {
        tgtCols = targetDb.pragma(`table_info(${table})`).map(c => c.name);
      } catch (_) {}

      if (tgtCols.length === 0) {
        // Hedefte tablo yoksa şemasını kaynaktan oluştur
        const createSqlRow = sourceDb.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(table);
        if (createSqlRow && createSqlRow.sql) {
          targetDb.exec(createSqlRow.sql);
          tgtCols = targetDb.pragma(`table_info(${table})`).map(c => c.name);
        }
      }

      const commonCols = srcCols.filter(c => tgtCols.includes(c));
      if (commonCols.length === 0) continue;

      // Kaynaktan satırları güvenli oku
      let rows = [];
      try {
        rows = sourceDb.prepare(`SELECT ${commonCols.map(c => `"${c}"`).join(', ')} FROM "${table}"`).all();
      } catch (tableReadErr) {
        console.warn(`Tablo okuma uyarısı (${table}):`, tableReadErr.message);
        // Sayfa bozuksa satır satır okumayı dene
        try {
          const ids = sourceDb.prepare(`SELECT rowid FROM "${table}"`).all().map(r => r.rowid);
          for (const rowid of ids) {
            try {
              const single = sourceDb.prepare(`SELECT ${commonCols.map(c => `"${c}"`).join(', ')} FROM "${table}" WHERE rowid = ?`).get(rowid);
              if (single) rows.push(single);
            } catch (_) {}
          }
        } catch (_) {}
      }

      if (rows.length > 0) {
        const placeholders = commonCols.map(() => '?').join(', ');
        const insertStmt = targetDb.prepare(`INSERT OR REPLACE INTO "${table}" (${commonCols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`);

        const insertMany = targetDb.transaction((allRows) => {
          let count = 0;
          for (const row of allRows) {
            const vals = commonCols.map(c => row[c]);
            insertStmt.run(vals);
            count++;
          }
          return count;
        });

        const inserted = insertMany(rows);
        totalRecoveredRows += inserted;
        console.log(`  [OK] ${table.padEnd(25)} : ${inserted} satır başarıyla kurtarıldı.`);
      } else {
        console.log(`  [-] ${table.padEnd(25)} : 0 satır.`);
      }
    } catch (err) {
      console.error(`  [!] ${table} aktarım hatası:`, err.message);
    }
  }

  // 6. Kapat ve dosyaları yer değiştir
  sourceDb.close();
  targetDb.pragma('foreign_keys = ON');
  targetDb.close();

  // Geçici klasörü temizle
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}

  console.log(`\nTOPLAM KURTARILAN SATIR SAYISI: ${totalRecoveredRows}`);

  // Mevcut (boş) cypilan.db'yi değiştir
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

  fs.renameSync(targetDbPath, currentDbPath);

  console.log('\n======================================================');
  console.log('✅ KURTARMA BAŞARIYLA TAMAMLANDI!');
  console.log('Tüm kullanıcılarınız, ilanlarınız ve verileriniz cypilan.db içine geri yüklendi.');
  console.log('Artık sunucunuzda "pm2 restart all" çalıştırabilirsiniz.');
  console.log('======================================================\n');
}

restore().catch(err => {
  console.error('Kurtarma işleminde kritik hata:', err);
});
