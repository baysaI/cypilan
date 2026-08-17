const Broadcast = require('../models/Broadcast');

const compose = async (req, res) => {
  try {
    const [counts, history] = await Promise.all([
      Broadcast.audienceCounts(),
      Broadcast.history(15)
    ]);

    const withStats = await Promise.all(history.map(async (item) => ({
      ...item,
      stats: await Broadcast.readStats(item)
    })));

    res.locals.meta.title = 'Duyuru Gönder | Admin Paneli';
    res.render('admin/broadcast', {
      layout: 'admin/layout',
      counts,
      history: withStats,
      roles: Broadcast.ROLES,
      languages: Broadcast.LANGUAGES,
      limits: {
        titleMax: Broadcast.TITLE_MAX_LENGTH,
        messageMax: Broadcast.MESSAGE_MAX_LENGTH,
        messageMin: Broadcast.MESSAGE_MIN_LENGTH
      },
      // Carried back so a rejected submission does not lose what was typed. A
      // long announcement is not something anybody wants to write twice.
      draft: (req.session && req.session.broadcastDraft) || {},
      activePage: 'broadcast',
      title: 'Duyuru Gönder'
    });

    if (req.session) delete req.session.broadcastDraft;
  } catch (error) {
    console.error('Broadcast Compose Error:', error);
    req.flash('error', 'flash.action_failed');
    res.redirect('/admin');
  }
};

const send = async (req, res) => {
  const keepDraft = () => {
    if (req.session && req.body && typeof req.body === 'object') {
      req.session.broadcastDraft = { ...req.body };
      delete req.session.broadcastDraft._csrf;
    }
  };

  try {
    const { title, message, link_url, audience, role, language, emails } = req.body;

    if (!Broadcast.AUDIENCES.includes(audience)) {
      keepDraft();
      req.flash('error', 'flash.broadcast_audience_invalid');
      return res.redirect('/admin/duyuru');
    }

    if (!String(title || '').trim()) {
      keepDraft();
      req.flash('error', 'flash.broadcast_title_required');
      return res.redirect('/admin/duyuru');
    }

    if (String(message || '').trim().length < Broadcast.MESSAGE_MIN_LENGTH) {
      keepDraft();
      req.flash('error', 'flash.broadcast_message_too_short', { min: Broadcast.MESSAGE_MIN_LENGTH });
      return res.redirect('/admin/duyuru');
    }

    // A link that will not be stored is worth saying so: the admin typed it
    // expecting recipients to be able to follow it.
    if (String(link_url || '').trim() && !Broadcast.safeLinkPath(link_url)) {
      keepDraft();
      req.flash('error', 'flash.broadcast_link_invalid');
      return res.redirect('/admin/duyuru');
    }

    const result = await Broadcast.send({
      title, message, link_url, audience, role, language, emails,
      sent_by: req.session.userId
    });

    if (result.sent === 0) {
      keepDraft();
      req.flash('error', 'flash.broadcast_no_recipients');
      return res.redirect('/admin/duyuru');
    }

    if (result.unmatched.length > 0) {
      // Sent, but not to everyone on the list — said plainly rather than folded
      // into the success message.
      req.flash('info', 'flash.broadcast_unmatched', {
        count: result.unmatched.length,
        emails: result.unmatched.slice(0, 5).join(', ')
      });
    }

    req.flash('success', 'flash.broadcast_sent', { count: result.sent });
    res.redirect('/admin/duyuru');
  } catch (error) {
    console.error('Broadcast Send Error:', error);
    keepDraft();
    req.flash('error', 'flash.action_failed');
    res.redirect('/admin/duyuru');
  }
};

module.exports = {
  compose,
  send
};
