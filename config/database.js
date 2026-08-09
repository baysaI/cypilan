const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const dbPath = path.join(__dirname, '..', 'database', 'cypilan.db');
const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
const seedPath = path.join(__dirname, '..', 'database', 'seed.sql');

let dbInstance = null;
let SQL = null;

const getDb = async () => {
  if (dbInstance) return dbInstance;

  if (!SQL) {
    SQL = await initSqlJs();
  }

  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (fs.existsSync(dbPath)) {
    const filebuffer = fs.readFileSync(dbPath);
    dbInstance = new SQL.Database(filebuffer);
  } else {
    dbInstance = new SQL.Database();
    saveDb();
  }

  return dbInstance;
};

const saveDb = () => {
  if (dbInstance) {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
};

const COLUMN_MIGRATIONS = [
  { table: 'users', column: 'show_phone', ddl: 'ALTER TABLE users ADD COLUMN show_phone INTEGER DEFAULT 1' },
  { table: 'users', column: 'has_password', ddl: 'ALTER TABLE users ADD COLUMN has_password INTEGER DEFAULT 1' }
];

const applyColumnMigrations = (db) => {
  COLUMN_MIGRATIONS.forEach(({ table, column, ddl }) => {
    const info = db.exec(`PRAGMA table_info(${table})`);
    const existing = info[0] ? info[0].values.map(row => row[1]) : [];
    if (existing.length > 0 && !existing.includes(column)) {
      db.run(ddl);
      console.log(`Migration applied: ${table}.${column}`);
    }
  });
};

const initialize = async () => {
  try {
    const db = await getDb();
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.run(schema);
    applyColumnMigrations(db);
    saveDb();
    console.log('Database schema initialized successfully.');
  } catch (error) {
    console.error('Error initializing database schema:', error);
    throw error;
  }
};

const seed = async () => {
  try {
    const db = await getDb();
    const seedData = fs.readFileSync(seedPath, 'utf8');
    db.run(seedData);
    saveDb();
    console.log('Database seeded successfully.');
  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  }
};

module.exports = {
  getDb,
  saveDb,
  initialize,
  applyColumnMigrations,
  seed
};
