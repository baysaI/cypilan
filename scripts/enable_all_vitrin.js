const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '..', 'database', 'cypilan.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const result = db.prepare("UPDATE listings SET is_featured = 1 WHERE status = 'active'").run();
console.log(`Vitrin güncellendi: ${result.changes} ilan vitrine eklendi.`);

const listings = db.prepare("SELECT id, title, price, currency, is_featured FROM listings WHERE status = 'active'").all();
console.log('\nAktif Vitrin İlanları:');
listings.forEach(l => console.log(`  [ID: ${l.id}] [Vitrin: ${l.is_featured}] ${l.title} - ${l.price} ${l.currency}`));

db.close();
