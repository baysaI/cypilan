// Shared setup for the test files.
//
// This module must be required FIRST in every test file, before anything that
// reaches for the database. It points DB_PATH at a throwaway file named after
// the process id, and config/database resolves that path when it opens its
// connection — so a test can never touch database/cypilan.db, and two test
// files running at once cannot see each other's rows.

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const dbFileName = `test-${process.pid}.db`;
const dbFile = path.join(rootDir, 'database', dbFileName);

process.env.DB_PATH = `./database/${dbFileName}`;

const { getDb, initialize, closeDb } = require(path.join(rootDir, 'config', 'database'));
const ejs = require('ejs');

const removeDbFiles = () => {
  ['', '-wal', '-shm'].forEach((suffix) => {
    fs.rmSync(dbFile + suffix, { force: true });
  });
};

// A fresh schema plus the seed categories, which most tests need in order to
// attach a listing to a real category.
const setup = async () => {
  removeDbFiles();
  await initialize();
  const db = getDb();
  db.exec(fs.readFileSync(path.join(rootDir, 'database', 'seed.sql'), 'utf8'));
  return db;
};

const teardown = () => {
  try {
    closeDb();
  } catch (error) {
    // Closing twice is harmless; the file removal below is what matters.
  }
  removeDbFiles();
};

// ---- Assertions -------------------------------------------------------------

let passed = 0;
let failed = 0;

const ok = (message) => {
  passed += 1;
  console.log('  ✅ ' + message);
};

const fail = (message) => {
  failed += 1;
  console.error('  ❌ ' + message);
};

const assert = (condition, successMessage, failureMessage) => {
  if (condition) ok(successMessage);
  else fail(failureMessage || successMessage);
  return Boolean(condition);
};

const assertEqual = (actual, expected, message) =>
  assert(actual === expected, message, `${message} (beklenen: ${expected}, gelen: ${actual})`);

// Something that must NOT be allowed. Named separately from assert so a
// permission check reads as one in the test file.
const assertRejected = (result, message) =>
  assert(!result, message, `GÜVENLİK: ${message} — işlem engellenmedi`);

const results = () => ({ passed, failed });

// ---- Rendering --------------------------------------------------------------

const { translate } = require(path.join(rootDir, 'config', 'i18n'));
const helpers = require(path.join(rootDir, 'utils', 'helpers'));
const cities = require(path.join(rootDir, 'config', 'cities'));
const listingBadges = require(path.join(rootDir, 'config', 'listingBadges'));

// The locals server.js puts on every response. Rendering a view with anything
// less would fail for reasons the template is not responsible for.
const baseLocals = (overrides = {}) => Object.assign({
  lang: 'tr',
  currency: 'TRY',
  helpers,
  cities,
  listingBadges,
  csrfToken: 'test-token',
  t: (key, params) => translate(key, 'tr', params)
}, overrides);

const render = (viewPath, locals = {}) =>
  ejs.renderFile(path.join(rootDir, 'views', viewPath), baseLocals(locals));

// ---- Fixtures ---------------------------------------------------------------

const makeUser = (db, email, fullName, role = 'user') => Number(db.prepare(
  'INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, ?, ?)'
).run([email, 'test-hash', fullName, role]).lastInsertRowid);

// Wraps a test file's body so that a thrown error is reported as a failure
// rather than an unhandled rejection, and the scratch database is always
// removed even when an assertion blows up.
const run = async (title, body) => {
  console.log(`\n${title}`);
  const db = await setup();

  try {
    await body(db);
  } catch (error) {
    fail('Test beklenmedik hata ile durdu: ' + error.message);
    console.error(error.stack);
  } finally {
    teardown();
  }

  const { passed: p, failed: f } = results();
  console.log(`  ${f === 0 ? '✅' : '❌'} ${p} geçti, ${f} başarısız`);
  process.exitCode = f === 0 ? 0 : 1;
};

module.exports = {
  rootDir,
  setup,
  teardown,
  run,
  ok,
  fail,
  assert,
  assertEqual,
  assertRejected,
  results,
  render,
  baseLocals,
  makeUser,
  translate,
  helpers,
  cities,
  listingBadges
};
