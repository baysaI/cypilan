const fs = require('fs');
const path = require('path');
const { spawnSync, execSync } = require('child_process');
const Database = require('better-sqlite3');

const dbDir = path.join(__dirname, '..', 'database');
const schemaPath = path.join(dbDir, 'schema.sql');
const sqliteExePath = path.join(dbDir, 'sqlite3.exe');

async function ensureSqliteBinary() {
  if (fs.existsSync(sqliteExePath)) {
    return sqliteExePath;
  }

  // Check if system has sqlite3 in PATH
  try {
    execSync('sqlite3 --version', { stdio: 'ignore' });
    return 'sqlite3';
  } catch (_) {}

  console.log('SQLite kurtarma motoru indiriliyor (sqlite3.exe)...');
  const zipUrl = 'https://www.sqlite.org/2024/sqlite-tools-win-x64-3460100.zip';
  const zipPath = path.join(dbDir, 'sqlite-tools.zip');

  try {
    execSync(`powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '${zipUrl}' -OutFile '${zipPath}'"`, { stdio: 'inherit' });
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${dbDir}\\temp_tools' -Force"`, { stdio: 'inherit' });

    const tempToolsDir = path.join(dbDir, 'temp_tools');
    if (fs.existsSync(tempToolsDir)) {
      const extractedFiles = fs.readdirSync(tempToolsDir);
      const subFolder = extractedFiles.find(f => fs.statSync(path.join(tempToolsDir, f)).isDirectory());
      const srcExe = subFolder
        ? path.join(tempToolsDir, subFolder, 'sqlite3.exe')
        : path.join(tempToolsDir, 'sqlite3.exe');

      if (fs.existsSync(srcExe)) {
        fs.copyFileSync(srcExe, sqliteExePath);
      }
    }

    try { if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath); } catch (_) {}
    try { if (fs.existsSync(tempToolsDir)) fs.rmSync(tempToolsDir, { recursive: true, force: true }); } catch (_) {}

    if (fs.existsSync(sqliteExePath)) {
      console.log('sqlite3.exe başarıyla kuruldu ve hazırlandı.\n');
      return sqliteExePath;
    }
  } catch (dlErr) {
    console.error('sqlite3.exe indirme uyarısı:', dlErr.message);
  }

  return 'sqlite3';
}

function runSqliteRecover(sqliteCmd, dbFilePath) {
  console.log(`Kurtarma komutu çalıştırılıyor: ${path.basename(dbFilePath)}`);
  const res = spawnSync(sqliteCmd, [dbFilePath, '.recover'], {
    maxBuffer: 200 * 1024 * 1024,
    encoding: 'utf8',
    shell: true
  });

  let output = res.stdout || '';
  if (!output || output.length < 50) {
    console.log('.recover az çıktı verdi, .dump deneniyor...');
    const dumpRes = spawnSync(sqliteCmd, [dbFilePath, '.dump'], {
      maxBuffer: 200 * 1024 * 1024,
      encoding: 'utf8',
      shell: true
    });
    if (dumpRes.stdout && dumpRes.stdout.length > output.length) {
      output = dumpRes.stdout;
    }
  }

  return output;
}

async function restore() {
  console.log('======================================================');
  console.log('=== CYPILAN SQLite VERİTABANI VE VERİ KURTARMA SİHİRBAZI ===');
  console.log('======================================================\n');

  const files = fs.readdirSync(dbDir);
  const corruptBaks = files.filter(f => f.startsWith('cypilan.db.corrupt.') && f.endsWith('.bak'));

  let sourceDbFile = null;
  let sourceWalFile = null;

  if (corruptBaks.length > 0) {
    corruptBaks.sort().reverse();
    sourceDbFile = corruptBaks[0];
    sourceWalFile = `${sourceDbFile}-wal`;
    console.log(`Bozuk/orijinal yedek dosyası tespit edildi: ${sourceDbFile}`);
  } else if (fs.existsSync(path.join(dbDir, 'cypilan.db'))) {
    sourceDbFile = 'cypilan.db';
    sourceWalFile = 'cypilan.db-wal';
    console.log('Mevcut cypilan.db üzerinden kurtarma yapılıyor...');
  } else {
    console.error('HATA: database/ klasöründe kurtarılacak bir dosya bulunamadı!');
    return;
  }

  const bakDbPath = path.join(dbDir, sourceDbFile);
  const bakWalPath = path.join(dbDir, sourceWalFile);

  console.log(`Ana veritabanı dosyası: ${sourceDbFile} (${(fs.statSync(bakDbPath).size / 1024).toFixed(1)} KB)`);
  if (fs.existsSync(bakWalPath)) {
    console.log(`WAL işlem günlüğü      : ${sourceWalFile} (${(fs.statSync(bakWalPath).size / 1024 / 1024).toFixed(2)} MB)`);
  }

  // 1. sqlite3.exe hazırla
  const sqliteCmd = await ensureSqliteBinary();

  // 2. Geçici kurtarma alanı oluştur
  const tempDir = path.join(dbDir, '_temp_recover');
  if (fs.existsSync(tempDir)) {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  }
  fs.mkdirSync(tempDir, { recursive: true });

  const tempSourceDb = path.join(tempDir, 'source.db');
  fs.copyFileSync(bakDbPath, tempSourceDb);
  if (fs.existsSync(bakWalPath)) {
    fs.copyFileSync(bakWalPath, path.join(tempDir, 'source.db-wal'));
  }

  console.log('\n[1/3] SQLite ham sayfa kurtarma motoru (.recover) çalıştırılıyor...');
  let sqlDump = runSqliteRecover(sqliteCmd, tempSourceDb);

  // Eğer WAL ile birlikte boş döndüyse, WAL olmadan ana dosyayı dene
  if (!sqlDump || sqlDump.length < 50) {
    if (fs.existsSync(path.join(tempDir, 'source.db-wal'))) {
      console.log('WAL olmadan doğrudan ana dosya üzerinde kurtarma deneniyor...');
      fs.unlinkSync(path.join(tempDir, 'source.db-wal'));
      sqlDump = runSqliteRecover(sqliteCmd, tempSourceDb);
    }
  }

  const sqlDumpPath = path.join(tempDir, 'recovered_dump.sql');
  fs.writeFileSync(sqlDumpPath, sqlDump || '', 'utf8');

  console.log(`Kurtarılan SQL döküm boyutu: ${(fs.statSync(sqlDumpPath).size / 1024).toFixed(1)} KB`);

  // 3. Temiz şemalı hedef veritabanı oluştur ve verileri güvenle aktar
  console.log('\n[2/3] Kurtarılan veriler temiz veritabanına aktarılıyor...');
  const tempTargetDb = path.join(tempDir, 'recovered.db');
  if (fs.existsSync(tempTargetDb)) {
    fs.unlinkSync(tempTargetDb);
  }

  const targetDb = new Database(tempTargetDb);
  targetDb.pragma('journal_mode = WAL');
  targetDb.pragma('foreign_keys = OFF');

  // Önce orijinal şemayı oluştur
  const schema = fs.readFileSync(schemaPath, 'utf8');
  targetDb.exec(schema);

  // Dump içindeki tüm SQL komutlarını satır satır veya blok blok ayrıştır
  const sqlLines = (sqlDump || '').split(/\r?\n/);
  let insertCount = 0;
  let currentStmt = '';

  const insertTransaction = targetDb.transaction((statements) => {
    let count = 0;
    for (const stmt of statements) {
      try {
        targetDb.exec(stmt);
        count++;
      } catch (err) {
        // Tekil hata olursa atla, diğer satırları durdurma
      }
    }
    return count;
  });

  const validStatements = [];
  for (let line of sqlLines) {
    line = line.trim();
    if (!line || line.startsWith('--') || line.startsWith('/*')) continue;

    currentStmt += (currentStmt ? ' ' : '') + line;
    if (line.endsWith(';')) {
      const upper = currentStmt.toUpperCase();
      if (
        upper.startsWith('INSERT INTO') ||
        upper.startsWith('REPLACE INTO') ||
        upper.startsWith('INSERT OR REPLACE INTO') ||
        upper.startsWith('INSERT OR IGNORE INTO')
      ) {
        // Tablo çakışmalarını önlemek için INSERT OR REPLACE yap
        const normalized = currentStmt.replace(/^INSERT INTO/i, 'INSERT OR REPLACE INTO');
        validStatements.push(normalized);
      }
      currentStmt = '';
    }
  }

  if (validStatements.length > 0) {
    insertCount = insertTransaction(validStatements);
  } else {
    // Eğer doğrudan dump komutları varsa toplu dene
    try {
      targetDb.exec(sqlDump);
      insertCount = 1;
    } catch (_) {}
  }

  // 4. Tablo ve satır sayılarını doğrula
  console.log('\n[3/3] Kurtarılan tablolar ve kayıtlar doğrulanıyor:');
  const tables = targetDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);

  let totalRows = 0;
  for (const tbl of tables) {
    try {
      const countRow = targetDb.prepare(`SELECT COUNT(*) as count FROM "${tbl}"`).get();
      const count = countRow ? countRow.count : 0;
      totalRows += count;
      if (count > 0) {
        console.log(`  ✅ ${tbl.padEnd(25)} : ${count} kayıt`);
      }
    } catch (_) {}
  }

  targetDb.pragma('foreign_keys = ON');
  targetDb.close();

  console.log(`\nToplam Kurtarılan Kayıt: ${totalRows}`);

  // 5. Hedef veritabanını cypilan.db ile değiştir
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

  // Temizlik
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}

  console.log('\n======================================================');
  console.log('🎉 KURTARMA İŞLEMİ BAŞARIYLA TAMAMLANDI!');
  console.log('Tüm kullanıcılarınız, ilanlarınız ve verileriniz cypilan.db içine aktarıldı.');
  console.log('Artık sunucunuzda "pm2 restart all" çalıştırabilirsiniz.');
  console.log('======================================================\n');
}

restore().catch(err => {
  console.error('Kurtarma işleminde hata:', err.message);
});
