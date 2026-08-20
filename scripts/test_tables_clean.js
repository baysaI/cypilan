const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbDir = path.join(__dirname, '..', 'database');
const tempDir = path.join(dbDir, '_temp_recover');
const rawDumpDbPath = path.join(tempDir, 'raw_dump.db');

if (fs.existsSync(rawDumpDbPath)) {
  const rawDb = new Database(rawDumpDbPath);
  const testDb = new Database(':memory:');
  testDb.exec(fs.readFileSync(path.join(dbDir, 'schema.sql'), 'utf8'));

  const tables = ['users', 'listings', 'listing_images', 'page_views', 'support_conversations', 'settings', 'user_warnings'];
  for (const t of tables) {
    try {
      console.log(`Checking table: ${t}`);
      const rows = rawDb.prepare(`SELECT * FROM ${t}`).all();
      console.log(`  -> ${rows.length} rows read cleanly from rawDumpDb`);
    } catch (e) {
      console.log(`  -> Error reading ${t}:`, e.message);
    }
  }
  rawDb.close();
  testDb.close();
}
