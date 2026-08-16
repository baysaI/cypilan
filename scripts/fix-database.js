const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH
  ? path.resolve(__dirname, '..', process.env.DB_PATH)
  : path.join(__dirname, '..', 'database', 'cypilan.db');

const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');

console.log('----------------------------------------------------');
console.log('🔧 CYPILAN - Veritabanı ve Tablo Onarım Aracı');
console.log('📁 Veritabanı Dosyası:', dbPath);
console.log('----------------------------------------------------');

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('1️⃣ Şema dosyası kontrol ediliyor ve uygulanıyor...');
if (fs.existsSync(schemaPath)) {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
  console.log('  ✅ schema.sql başarıyla çalıştırıldı.');
}

console.log('2️⃣ notifications ve diğer tablolar güvence altına alınıyor...');
db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link_url TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS user_warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    issued_by INTEGER REFERENCES users(id),
    report_id INTEGER REFERENCES reports(id),
    reason TEXT NOT NULL CHECK(reason IN ('wrong_category', 'misleading_price', 'missing_photos', 'spam', 'fraud', 'inappropriate', 'harassment', 'other')),
    note TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_warnings_user ON user_warnings(user_id, is_active, created_at DESC);

  CREATE TABLE IF NOT EXISTS service_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    listing_id INTEGER REFERENCES listings(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('assurance', 'promotion')),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'contacted', 'approved', 'rejected', 'completed')),
    note TEXT,
    admin_note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_service_requests_queue ON service_requests(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_service_requests_user ON service_requests(user_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS user_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(blocker_id, blocked_id)
  );

  CREATE TABLE IF NOT EXISTS page_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    path TEXT NOT NULL,
    ip_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS support_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_token TEXT NOT NULL UNIQUE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    user_name TEXT,
    user_email TEXT,
    agent_name TEXT,
    status TEXT DEFAULT 'waiting',
    assigned_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    rating INTEGER,
    rating_comment TEXT,
    unread_user_count INTEGER DEFAULT 0,
    unread_admin_count INTEGER DEFAULT 0,
    last_message TEXT,
    last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS support_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL,
    sender_id INTEGER,
    sender_name TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
console.log('  ✅ notifications ve tüm destek tabloları oluşturuldu/doğrulandı.');

console.log('3️⃣ Sütun migrasyonları kontrol ediliyor...');
const columnsOf = (table) => db.pragma(`table_info(${table})`).map((col) => col.name);

const COLUMN_MIGRATIONS = [
  { table: 'users', column: 'show_phone', ddl: 'ALTER TABLE users ADD COLUMN show_phone INTEGER DEFAULT 1' },
  { table: 'users', column: 'has_password', ddl: 'ALTER TABLE users ADD COLUMN has_password INTEGER DEFAULT 1' },
  { table: 'users', column: 'password_reset_token', ddl: 'ALTER TABLE users ADD COLUMN password_reset_token TEXT' },
  { table: 'users', column: 'password_reset_expires', ddl: 'ALTER TABLE users ADD COLUMN password_reset_expires DATETIME' },
  { table: 'users', column: 'email_verification_token', ddl: 'ALTER TABLE users ADD COLUMN email_verification_token TEXT' },
  { table: 'users', column: 'email_verification_expires', ddl: 'ALTER TABLE users ADD COLUMN email_verification_expires DATETIME' },
  { table: 'reports', column: 'type', ddl: "ALTER TABLE reports ADD COLUMN type TEXT DEFAULT 'listing'" },
  { table: 'candidate_profiles', column: 'photo_url', ddl: 'ALTER TABLE candidate_profiles ADD COLUMN photo_url TEXT' },
  { table: 'candidate_profiles', column: 'custom_cv_url', ddl: 'ALTER TABLE candidate_profiles ADD COLUMN custom_cv_url TEXT' },
  { table: 'candidate_profiles', column: 'custom_cv_name', ddl: 'ALTER TABLE candidate_profiles ADD COLUMN custom_cv_name TEXT' },
  { table: 'candidate_profiles', column: 'custom_cv_size', ddl: 'ALTER TABLE candidate_profiles ADD COLUMN custom_cv_size INTEGER' },
  { table: 'support_conversations', column: 'agent_name', ddl: 'ALTER TABLE support_conversations ADD COLUMN agent_name TEXT' }
];

COLUMN_MIGRATIONS.forEach(({ table, column, ddl }) => {
  try {
    const existing = columnsOf(table);
    if (existing.length > 0 && !existing.includes(column)) {
      db.exec(ddl);
      console.log(`  ➕ Sütun eklendi: ${table}.${column}`);
    }
  } catch (err) {
    console.warn(`  ⚠️ ${table}.${column} uyarısı:`, err.message);
  }
});

db.close();

console.log('----------------------------------------------------');
console.log('🎉 VERİTABANI ONARIMI BAŞARIYLA TAMAMLANDI!');
console.log('----------------------------------------------------');
