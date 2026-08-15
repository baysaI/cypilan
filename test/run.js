// Runs every *.test.js in this folder and reports one summary.
//
// Each file runs in its own child process. That is not ceremony: config/database
// keeps a single connection in module scope and reads DB_PATH once, so two test
// files sharing a process would share a database and see each other's rows.
// Separate processes give each file a clean schema and remove any ordering
// dependency between them.
//
//   npm test              → run everything
//   npm test reviews      → run only the files whose name contains "reviews"

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const testDir = __dirname;
const filter = process.argv[2];

const files = fs.readdirSync(testDir)
  .filter((name) => name.endsWith('.test.js'))
  .filter((name) => !filter || name.includes(filter))
  .sort();

if (files.length === 0) {
  console.error(filter ? `"${filter}" ile eşleşen test dosyası yok.` : 'Test dosyası bulunamadı.');
  process.exit(1);
}

console.log(`${files.length} test dosyası çalıştırılıyor...`);

const startedAt = Date.now();
const failedFiles = [];

files.forEach((name) => {
  const result = spawnSync(process.execPath, [path.join(testDir, name)], {
    stdio: 'inherit',
    env: process.env
  });

  if (result.status !== 0) failedFiles.push(name);
});

const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

console.log('\n' + '─'.repeat(52));

if (failedFiles.length === 0) {
  console.log(`✅ ${files.length} test dosyasının hepsi geçti (${seconds} sn)`);
  process.exit(0);
}

console.log(`❌ ${failedFiles.length}/${files.length} test dosyası başarısız (${seconds} sn)`);
failedFiles.forEach((name) => console.log(`   - ${name}`));
process.exit(1);
