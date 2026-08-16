const t = require('./helpers');
const Analytics = require('../models/Analytics');

t.run('Analytics Live Log & Ranking Tests', async (db) => {
  // Insert sample page view records
  db.prepare(`
    INSERT INTO page_views (session_id, user_id, path, ip_hash, created_at)
    VALUES
      ('sess_1', NULL, '/', 'hash1', datetime('now', '-10 minutes')),
      ('sess_1', NULL, '/listings/123', 'hash1', datetime('now', '-5 minutes')),
      ('sess_2', NULL, '/listings/123', 'hash2', datetime('now', '-2 minutes')),
      ('sess_3', NULL, '/auth/login', 'hash3', datetime('now', '-1 minute'))
  `).run();

  // 1. Test getRecentLogs
  const logs = await Analytics.getRecentLogs(1, 10);
  t.assert(logs && Array.isArray(logs.data), 'getRecentLogs returns data array');
  t.assertEqual(logs.total, 4, 'Total log count matches inserted rows');
  t.assertEqual(logs.data[0].path, '/auth/login', 'Most recent log is listed first');

  // 2. Test getTopPages
  const topPages = await Analytics.getTopPages(10);
  t.assert(Array.isArray(topPages), 'getTopPages returns array');
  t.assertEqual(topPages[0].path, '/listings/123', 'Most viewed page /listings/123 is top ranked');
  t.assertEqual(topPages[0].views, 2, 'Top page views count is 2');

  // 3. Test getTopVisitors
  const topVisitors = await Analytics.getTopVisitors(10);
  t.assert(Array.isArray(topVisitors), 'getTopVisitors returns array');
  t.assertEqual(topVisitors[0].view_count, 2, 'Top visitor page view count is 2');
});
