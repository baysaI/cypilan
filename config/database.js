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

const initialize = async () => {
  try {
    const db = await getDb();
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.run(schema);
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
  seed
};
