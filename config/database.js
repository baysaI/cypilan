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

const handleCorruptDatabase = (err, db) => {
  console.error('CRITICAL: SQLite database disk image is malformed/corrupt!', err.message);
  if (db) {
    try { db.close(); } catch (_) {}
  }
  const timestamp = Date.now();
  const backupBase = `${dbPath}.corrupt.${timestamp}.bak`;
  if (fs.existsSync(dbPath)) {
    try {
      fs.copyFileSync(dbPath, backupBase);
      fs.unlinkSync(dbPath);
    } catch (e) {
      console.error('Backup copy error:', e);
    }
  }
  if (fs.existsSync(`${dbPath}-wal`)) {
    try {
      fs.copyFileSync(`${dbPath}-wal`, `${backupBase}-wal`);
      fs.unlinkSync(`${dbPath}-wal`);
    } catch (_) {}
  }
  if (fs.existsSync(`${dbPath}-shm`)) {
    try {
      fs.unlinkSync(`${dbPath}-shm`);
    } catch (_) {}
  }
  console.warn(`[SQLite Auto-Recovery] Corrupted database backed up to: ${backupBase} and a fresh database is initialized.`);
};

const getDb = () => {
  if (dbInstance) return dbInstance;

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  dbInstance = new Database(dbPath);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  try {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    dbInstance.exec(schema);
    applyColumnMigrations(dbInstance);

    const catCount = dbInstance.prepare("SELECT COUNT(*) as count FROM categories").get();
    if (!catCount || catCount.count === 0) {
      const seedData = fs.readFileSync(seedPath, 'utf8');
      dbInstance.exec(seedData);
    }
  } catch (schemaErr) {
    console.error('Database schema initialization warning:', schemaErr.message);
  }

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
  { table: 'users', column: 'show_surname', ddl: 'ALTER TABLE users ADD COLUMN show_surname INTEGER DEFAULT 0' },
  { table: 'users', column: 'has_password', ddl: 'ALTER TABLE users ADD COLUMN has_password INTEGER DEFAULT 1' },
  { table: 'users', column: 'password_reset_token', ddl: 'ALTER TABLE users ADD COLUMN password_reset_token TEXT' },
  { table: 'users', column: 'password_reset_expires', ddl: 'ALTER TABLE users ADD COLUMN password_reset_expires DATETIME' },
  { table: 'users', column: 'email_verification_token', ddl: 'ALTER TABLE users ADD COLUMN email_verification_token TEXT' },
  { table: 'users', column: 'email_verification_expires', ddl: 'ALTER TABLE users ADD COLUMN email_verification_expires DATETIME' },
  { table: 'users', column: 'last_seen_at', ddl: 'ALTER TABLE users ADD COLUMN last_seen_at DATETIME' },
  { table: 'listings', column: 'is_urgent', ddl: 'ALTER TABLE listings ADD COLUMN is_urgent INTEGER DEFAULT 0' },
  { table: 'listings', column: 'is_opportunity', ddl: 'ALTER TABLE listings ADD COLUMN is_opportunity INTEGER DEFAULT 0' },
  { table: 'listings', column: 'is_negotiable', ddl: 'ALTER TABLE listings ADD COLUMN is_negotiable INTEGER DEFAULT 0' },
  { table: 'listings', column: 'is_swap', ddl: 'ALTER TABLE listings ADD COLUMN is_swap INTEGER DEFAULT 0' },
  { table: 'reports', column: 'type', ddl: "ALTER TABLE reports ADD COLUMN type TEXT DEFAULT 'listing'" },
  { table: 'candidate_profiles', column: 'photo_url', ddl: 'ALTER TABLE candidate_profiles ADD COLUMN photo_url TEXT' },
  { table: 'candidate_profiles', column: 'custom_cv_url', ddl: 'ALTER TABLE candidate_profiles ADD COLUMN custom_cv_url TEXT' },
  { table: 'candidate_profiles', column: 'custom_cv_name', ddl: 'ALTER TABLE candidate_profiles ADD COLUMN custom_cv_name TEXT' },
  { table: 'candidate_profiles', column: 'custom_cv_size', ddl: 'ALTER TABLE candidate_profiles ADD COLUMN custom_cv_size INTEGER' },
  { table: 'support_conversations', column: 'agent_name', ddl: 'ALTER TABLE support_conversations ADD COLUMN agent_name TEXT' },
  { table: 'users', column: 'corporate_status', ddl: "ALTER TABLE users ADD COLUMN corporate_status TEXT DEFAULT 'none'" },
  { table: 'users', column: 'corporate_tax_no', ddl: 'ALTER TABLE users ADD COLUMN corporate_tax_no TEXT' },
  { table: 'users', column: 'corporate_type', ddl: 'ALTER TABLE users ADD COLUMN corporate_type TEXT' },
  { table: 'users', column: 'corporate_applied_at', ddl: 'ALTER TABLE users ADD COLUMN corporate_applied_at DATETIME' },
  { table: 'users', column: 'corporate_reviewed_at', ddl: 'ALTER TABLE users ADD COLUMN corporate_reviewed_at DATETIME' }
];

const columnsOf = (db, table) => db.pragma(`table_info(${table})`).map((column) => column.name);

const applyColumnMigrations = (db) => {
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

    CREATE TABLE IF NOT EXISTS page_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      path TEXT NOT NULL,
      ip_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_page_views_created ON page_views(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_page_views_session ON page_views(session_id);

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

    CREATE TABLE IF NOT EXISTS price_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      target_price REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, listing_id)
    );
    CREATE INDEX IF NOT EXISTS idx_price_alerts_user ON price_alerts(user_id);
    CREATE INDEX IF NOT EXISTS idx_price_alerts_listing ON price_alerts(listing_id);

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK(type IN ('bug', 'suggestion', 'other')),
      message TEXT NOT NULL,
      contact_email TEXT,
      page_url TEXT,
      status TEXT DEFAULT 'new' CHECK(status IN ('new', 'read', 'resolved')),
      admin_note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);

    CREATE TABLE IF NOT EXISTS broadcasts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link_url TEXT,
      audience TEXT NOT NULL,
      audience_detail TEXT,
      recipient_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_broadcasts_created ON broadcasts(created_at DESC);

    CREATE TABLE IF NOT EXISTS user_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(blocker_id, blocked_id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_id);
    CREATE INDEX IF NOT EXISTS idx_user_blocks_pair ON user_blocks(blocker_id, blocked_id);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  COLUMN_MIGRATIONS.forEach(({ table, column, ddl }) => {
    const existing = columnsOf(db, table);
    if (existing.length > 0 && !existing.includes(column)) {
      db.exec(ddl);
      console.log(`Migration applied: ${table}.${column}`);
    }
  });

  try {
    db.exec("UPDATE users SET last_seen_at = created_at WHERE last_seen_at IS NULL");
  } catch (e) {}

  // Ensure listings table CHECK constraint allows 'wanted'
  try {
    const tableSqlRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='listings'").get();
    if (tableSqlRow && tableSqlRow.sql && !tableSqlRow.sql.includes("'wanted'")) {
      const foreignKeysWereOn = db.pragma('foreign_keys', { simple: true }) === 1;
      if (foreignKeysWereOn) db.pragma('foreign_keys = OFF');
      try {
        db.transaction(() => {
          db.exec(`
            CREATE TABLE listings_migrated (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL REFERENCES users(id),
              category_id INTEGER NOT NULL REFERENCES categories(id),
              title TEXT NOT NULL,
              slug TEXT UNIQUE NOT NULL,
              description TEXT,
              price REAL,
              currency TEXT DEFAULT 'TRY' CHECK(currency IN ('TRY', 'GBP')),
              listing_type TEXT DEFAULT 'sale' CHECK(listing_type IN ('sale', 'rent', 'job', 'service', 'bid_request', 'wanted')),
              status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'sold', 'expired', 'rejected', 'draft')),
              location_city TEXT,
              location_district TEXT,
              location_lat REAL,
              location_lng REAL,
              views_count INTEGER DEFAULT 0,
              is_premium INTEGER DEFAULT 0,
              is_featured INTEGER DEFAULT 0,
              is_urgent INTEGER DEFAULT 0,
              is_opportunity INTEGER DEFAULT 0,
              is_negotiable INTEGER DEFAULT 0,
              expires_at DATETIME,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO listings_migrated SELECT
              id, user_id, category_id, title, slug, description, price, currency,
              listing_type, status, location_city, location_district,
              location_lat, location_lng, views_count, is_premium, is_featured,
              COALESCE(is_urgent, 0), COALESCE(is_opportunity, 0), COALESCE(is_negotiable, 0),
              expires_at, created_at, updated_at
            FROM listings;
            DROP TABLE listings;
            ALTER TABLE listings_migrated RENAME TO listings;
          `);
        })();
        console.log("Migration applied: listings table rebuilt with 'wanted' listing_type support");
      } finally {
        if (foreignKeysWereOn) db.pragma('foreign_keys = ON');
      }
    }
  } catch (err) {
    console.error('Listings check constraint migration check error:', err);
  }

  // These live here rather than in schema.sql because they index columns the loop
  // above adds. schema.sql is executed first, and on a database that predates
  // those columns a CREATE INDEX naming one fails the whole file — taking the
  // rest of the schema down with it.
  //
  // Partial indexes: each holds only the flagged rows, a handful beside the full
  // table. That makes "show me the urgent ones" cheap without charging every
  // ordinary listing insert for three more index writes.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_listings_urgent
      ON listings(status, created_at DESC) WHERE is_urgent = 1;
    CREATE INDEX IF NOT EXISTS idx_listings_opportunity
      ON listings(status, created_at DESC) WHERE is_opportunity = 1;
    CREATE INDEX IF NOT EXISTS idx_listings_negotiable
      ON listings(status, created_at DESC) WHERE is_negotiable = 1;
  `);
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
