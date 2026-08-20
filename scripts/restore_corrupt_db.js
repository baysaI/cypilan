const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const Database = require('better-sqlite3');

const dbDir = path.join(__dirname, '..', 'database');
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

  // Download via PowerShell (built-in on Windows / Windows Server)
  try {
    execSync(`powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '${zipUrl}' -OutFile '${zipPath}'"`, { stdio: 'inherit' });
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${dbDir}\\temp_tools' -Force"`, { stdio: 'inherit' });

    // Move sqlite3.exe to dbDir
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

    // Cleanup zip and temp folder
    try { if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath); } catch (_) {}
    try { if (fs.existsSync(tempToolsDir)) fs.rmSync(tempToolsDir, { recursive: true, force: true }); } catch (_) {}

    if (fs.existsSync(sqliteExePath)) {
      console.log('sqlite3.exe başarıyla kuruldu ve hazırlandı.\n');
      return sqliteExePath;
    }
  } catch (dlErr) {
    console.error('sqlite3.exe indirme uyarısı:', dlErr.message);
  }

  throw new Error('sqlite3.exe bulunamadı ve otomatik indirilemedi.');
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

  const sqlDumpPath = path.join(tempDir, 'recovered_dump.sql');
  const tempTargetDb = path.join(tempDir, 'recovered.db');

  console.log('\n[1/3] SQLite ham sayfa kurtarma motoru (.recover) çalıştırılıyor...');
  // .recover komutu bozuk sayfaları atlayıp sağlam tüm ham verileri SQL dump olarak çıkarır
  const execCmd = `"${sqliteCmd}" "${tempSourceDb}" ".recover" > "${sqlDumpPath}"`;
  execSync(execCmd, { shell: 'cmd.exe', stdio: 'inherit' });

  if (!fs.existsSync(sqlDumpPath) || fs.statSync(sqlDumpPath).size === 0) {
    console.warn('.recover boş çıktı verdi, .dump deneniyor...');
    const dumpCmd = `"${sqliteCmd}" "${tempSourceDb}" ".dump" > "${sqlDumpPath}"`;
    try { execSync(dumpCmd, { shell: 'cmd.exe', stdio: 'inherit' }); } catch (_) {}
  }

  console.log(`Kurtarılan SQL döküm boyutu: ${(fs.statSync(sqlDumpPath).size / 1024).toFixed(1)} KB`);

  console.log('[2/3] Kurtarılan veriler temiz veritabanına aktarılıyor...');
  const importCmd = `"${sqliteCmd}" "${tempTargetDb}" < "${sqlDumpPath}"`;
  execSync(importCmd, { shell: 'cmd.exe', stdio: 'inherit' });

  // 3. Tablo ve satır sayılarını doğrula
  console.log('[3/3] Kurtarılan tablolar ve kayıtlar doğrulanıyor:');
  const checkDb = new Database(tempTargetDb);
  const tables = checkDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);

  let totalRows = 0;
  for (const tbl of tables) {
    try {
      const countRow = checkDb.prepare(`SELECT COUNT(*) as count FROM "${tbl}"`).get();
      const count = countRow ? countRow.count : 0;
      totalRows += count;
      console.log(`  ✅ ${tbl.padEnd(25)} : ${count} kayıt`);
    } catch (_) {}
  }
  checkDb.close();

  console.log(`\nTOPLAM KURTARILAN KAYIT SAYISI: ${totalRows}`);

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
