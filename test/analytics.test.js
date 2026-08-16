const t = require('./helpers');
const Analytics = require('../models/Analytics');
const { getDb } = require('../config/database');

t.run('Analytics Model Tests', async (db) => {
  // 1. Verify getSummary returns all timeframes
  const summary = await Analytics.getSummary();
  t.assert(summary && summary.today, 'Summary returns today stats');
  t.assert(summary && summary.week, 'Summary returns week stats');
  t.assert(summary && summary.month, 'Summary returns month stats');
  t.assert(summary && summary.year, 'Summary returns year stats');
  t.assert(summary && summary.all, 'Summary returns all stats');

  // 2. Verify getDailyTrends returns array of last N days
  const trends = await Analytics.getDailyTrends(30);
  t.assertEqual(trends.length, 30, 'Daily trends returns exactly 30 days');
  t.assert(trends[0].date && typeof trends[0].views === 'number', 'Trend entries have date and numeric views');

  // 3. Verify category distribution returns array
  const categories = await Analytics.getCategoryDistribution();
  t.assert(Array.isArray(categories), 'Category distribution returns array');
});
