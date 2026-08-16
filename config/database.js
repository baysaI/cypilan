const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

// .env.example has documented DB_PATH all along; it was never read.
const dbPath = process.env.DB_PATH
  ? path.resolve(__dirname, '..', process.env.DB_PATH)
  : path.join(__dirname, '..', 'database', 'cypilan.db');
const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
const seedPath = path.join(__dirname, '..', 'database', 'seed.sql');

let dbInstance = null;

// Synchronous, but callers may still await it: the models were written against
// a promise-returning getDb and awaiting a plain value is harmless.
const getDb = () => {
  if (dbInstance) return dbInstance;

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  dbInstance = new Database(dbPath);

  // WAL keeps readers from blocking the writer and gives crash recovery, which
  // the previous whole-file rewrite could not offer.
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(schemaPath, 'utf8');
  dbInstance.exec(schema);
  applyColumnMigrations(dbInstance);

  return dbInstance;
};

const closeDb = () => {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
};

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

const columnsOf = (db, table) => db.pragma(`table_info(${table})`).map((column) => column.name);

const applyColumnMigrations = (db) => {
  db.exec(`
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
    CREATE INDEX IF NOT EXISTS idx_support_conversations_token ON support_conversations(session_token);
    CREATE INDEX IF NOT EXISTS idx_support_conversations_status ON support_conversations(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_support_conversations_user ON support_conversations(user_id);

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
    CREATE INDEX IF NOT EXISTS idx_support_messages_conv ON support_messages(conversation_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_support_messages_read ON support_messages(conversation_id, is_read);
  `);

  COLUMN_MIGRATIONS.forEach(({ table, column, ddl }) => {
    const existing = columnsOf(db, table);
    if (existing.length > 0 && !existing.includes(column)) {
      db.exec(ddl);
      console.log(`Migration applied: ${table}.${column}`);
    }
  });
};

const TABLE_REBUILDS = [
  {
    table: 'reports',
    whenMissingColumn: 'reported_user_id',
    create: `
      CREATE TABLE reports_migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reporter_id INTEGER NOT NULL REFERENCES users(id),
        type TEXT DEFAULT 'listing' CHECK(type IN ('listing', 'user')),
        listing_id INTEGER REFERENCES listings(id),
        reported_user_id INTEGER REFERENCES users(id),
        message_id INTEGER REFERENCES messages(id),
        reason TEXT NOT NULL CHECK(reason IN ('wrong_category', 'misleading_price', 'missing_photos', 'spam', 'fraud', 'inappropriate', 'harassment', 'other')),
        description TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
        admin_note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `,
    copy: `
      INSERT INTO reports_migrated (id, reporter_id, type, listing_id, reason, description, status, admin_note, created_at)
      SELECT id, reporter_id, COALESCE(type, 'listing'), listing_id, reason, description, status, admin_note, created_at FROM reports
    `
  }
];

const applyTableRebuilds = (db) => {
  TABLE_REBUILDS.forEach(({ table, whenMissingColumn, create, copy }) => {
    const existing = columnsOf(db, table);
    if (existing.length === 0 || existing.includes(whenMissingColumn)) return;

    // Dropping and renaming a referenced table has to happen with enforcement
    // off, otherwise the intermediate state trips the very constraints the
    // rebuild is putting in place.
    const foreignKeysWereOn = db.pragma('foreign_keys', { simple: true }) === 1;
    if (foreignKeysWereOn) db.pragma('foreign_keys = OFF');

    try {
      db.transaction(() => {
        db.exec(create);
        db.exec(copy);
        db.exec(`DROP TABLE ${table}`);
        db.exec(`ALTER TABLE ${table}_migrated RENAME TO ${table}`);
      })();
      console.log(`Migration applied: ${table} table rebuilt`);
    } finally {
      if (foreignKeysWereOn) db.pragma('foreign_keys = ON');
    }
  });
};

const initialize = async () => {
  try {
    const db = getDb();
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);
    applyColumnMigrations(db);
    applyTableRebuilds(db);
    console.log('Database schema initialized successfully.');
  } catch (error) {
    console.error('Error initializing database schema:', error);
    throw error;
  }
};

// Creates the first admin only when none exists. The password comes from the
// environment, or is generated and printed once — never committed to the repo.
const ensureAdminUser = async (db) => {
  const { count } = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get();
  if (count > 0) return;

  const email = (process.env.ADMIN_EMAIL || 'admin@cypilan.com').trim().toLowerCase();
  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');
  const passwordHash = await bcrypt.hash(password, 10);

  db.prepare(`
    INSERT INTO users (email, password_hash, full_name, role, is_verified, is_active)
    VALUES (?, ?, ?, 'admin', 1, 1)
  `).run([email, passwordHash, 'System Admin']);

  if (generated) {
    console.log('');
    console.log('⚠️  Admin hesabı oluşturuldu — bu şifre bir daha gösterilmeyecek:');
    console.log(`   E-posta : ${email}`);
    console.log(`   Şifre   : ${password}`);
    console.log('   Sabitlemek için .env dosyasına ADMIN_EMAIL / ADMIN_PASSWORD ekleyin.');
    console.log('');
  } else {
    console.log(`Admin hesabı oluşturuldu: ${email}`);
  }
};

const seed = async () => {
  try {
    const db = getDb();
    const seedData = fs.readFileSync(seedPath, 'utf8');
    db.exec(seedData);
    await ensureAdminUser(db);
    console.log('Database seeded successfully.');
  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  }
};

module.exports = {
  getDb,
  closeDb,
  initialize,
  applyColumnMigrations,
  applyTableRebuilds,
  seed
};
