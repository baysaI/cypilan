const Feedback = require('../models/Feedback');
const { isValidEmail } = require('../utils/validators');

const PAGE_SIZE = 30;

// The form posts the page it was opened from so a report reads as "this is broken
// *here*". Only a same-site path is kept: the field is client-supplied, and an
// absolute URL in there would put a link to somebody else's site in front of an
// admin who has every reason to click it.
const safePagePath = (value) => {
  const raw = String(value || '').trim();
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw.slice(0, 500);
};

const backTo = (req, submittedPath) => safePagePath(submittedPath) || req.get('referer') || '/';

const submit = async (req, res) => {
  const redirectTo = backTo(req, req.body.page_url);

  try {
    const type = Feedback.TYPES.includes(req.body.type) ? req.body.type : 'other';
    const message = String(req.body.message || '').trim();

    if (message.length < Feedback.MESSAGE_MIN_LENGTH) {
      req.flash('error', 'flash.feedback_too_short', { min: Feedback.MESSAGE_MIN_LENGTH });
      return res.redirect(redirectTo);
    }

    // An address is optional — the point is to lower the barrier, not to collect
    // contact details — but a mistyped one is worth saying out loud, because the
    // sender thinks they will hear back.
    const rawEmail = String(req.body.contact_email || '').trim();
    if (rawEmail && !isValidEmail(rawEmail)) {
      req.flash('error', 'flash.invalid_email');
      return res.redirect(redirectTo);
    }

    await Feedback.create({
      user_id: (req.session && req.session.userId) || null,
      type,
      message: message.slice(0, Feedback.MESSAGE_MAX_LENGTH),
      contact_email: rawEmail ? rawEmail.toLowerCase().slice(0, 200) : null,
      page_url: safePagePath(req.body.page_url)
    });

    req.flash('success', 'flash.feedback_received');
    res.redirect(redirectTo);
  } catch (error) {
    console.error('Feedback Submit Error:', error);
    req.flash('error', 'flash.feedback_failed');
    res.redirect(redirectTo);
  }
};

const adminQueue = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const filters = { status: req.query.status, type: req.query.type };

    const [result, counts] = await Promise.all([
      Feedback.findAll(filters, page, PAGE_SIZE),
      Feedback.countByStatus()
    ]);

    res.locals.meta.title = 'Öneri & Hata Bildirimleri | Admin Paneli';
    res.render('admin/feedback', {
      layout: 'admin/layout',
      feedback: result.data,
      pagination: { page, totalItems: result.total, totalPages: result.pages },
      filters,
      counts,
      types: Feedback.TYPES,
      statuses: Feedback.STATUSES,
      activePage: 'feedback',
      title: 'Öneri & Hata Bildirimleri'
    });
  } catch (error) {
    console.error('Admin Feedback Error:', error);
    req.flash('error', 'flash.action_failed');
    res.redirect('/admin');
  }
};

const adminSetStatus = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status, admin_note } = req.body;

    if (!Number.isInteger(id) || !Feedback.STATUSES.includes(status)) {
      req.flash('error', 'flash.invalid_status');
      return res.redirect('/admin/geri-bildirim');
    }

    const note = (admin_note && String(admin_note).trim().slice(0, 1000)) || null;
    const updated = await Feedback.setStatus(id, status, note);

    req.flash(updated ? 'success' : 'error', updated ? 'flash.feedback_updated' : 'flash.action_failed');
    res.redirect(req.get('referer') || '/admin/geri-bildirim');
  } catch (error) {
    console.error('Admin Feedback Status Error:', error);
    req.flash('error', 'flash.action_failed');
    res.redirect('/admin/geri-bildirim');
  }
};

const adminDelete = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const removed = Number.isInteger(id) && await Feedback.remove(id);

    req.flash(removed ? 'success' : 'error', removed ? 'flash.feedback_deleted' : 'flash.action_failed');
    res.redirect(req.get('referer') || '/admin/geri-bildirim');
  } catch (error) {
    console.error('Admin Feedback Delete Error:', error);
    req.flash('error', 'flash.action_failed');
    res.redirect('/admin/geri-bildirim');
  }
};

module.exports = {
  submit,
  adminQueue,
  adminSetStatus,
  adminDelete,
  safePagePath
};
