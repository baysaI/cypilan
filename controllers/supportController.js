const Support = require('../models/Support');
const User = require('../models/User');
const crypto = require('crypto');

// Quick automated knowledge base responses for FAQ chips
const FAQ_KNOWLEDGE_BASE = {
  faq_post_listing: {
    title: 'İlan Nasıl Verilir?',
    answer: 'CYPILAN üzerinden ilan vermek çok kolay ve tamamen ücretsizdir! Üst menüde yer alan "+ İlan Ver" butonuna tıklayarak kategorinizi seçebilir, ilan başlığı, açıklama, fotoğraf ve detayları girerek birkaç saniye içinde ilanınızı yayına alabilirsiniz.'
  },
  faq_featured: {
    title: 'İlanımı Nasıl Öne Çıkarırım?',
    answer: 'İlanlarınızı arama sonuçlarında ve ana sayfada en üst sıralara taşımak için "İlanlarım" sayfasından ilgili ilanınızın yanındaki "Öne Çıkar" butonuna basarak vitrin & doping talebi oluşturabilirsiniz.'
  },
  faq_cv: {
    title: 'Kariyer & CV Sistemi',
    answer: 'Kariyer portalımızda yer alan "Özgeçmişim" bölümünden profilinizi doldurabilir, hazır PDF özgeçmişinizi yükleyebilir veya tek tıkla resmi filigranlı CYPILAN CV formatında PDF çıktısı alabilirsiniz.'
  },
  faq_corporate: {
    title: 'Kurumsal Üyelik Avantajları',
    answer: 'Emlak ofisleri, oto galeriler ve kurumsal işletmeler için sınırsız ilan hakkı, özel şirket profil sayfası, aramalarda öncelik ve detaylı performans paneli sunulmaktadır. Kurumsal üyelik için destek ekibimizle iletişime geçebilirsiniz.'
  }
};

// ---- Client / Visitor Endpoints ---------------------------------------------

const initChat = async (req, res) => {
  try {
    let sessionToken = req.body.session_token || req.headers['x-support-token'];
    if (!sessionToken || typeof sessionToken !== 'string' || sessionToken.length < 10) {
      sessionToken = crypto.randomBytes(16).toString('hex');
    }

    const userDetails = {};
    if (req.session && req.session.userId) {
      const user = await User.findById(req.session.userId);
      if (user) {
        userDetails.userId = user.id;
        userDetails.name = user.full_name;
        userDetails.email = user.email;
      }
    } else {
      if (req.body.name) userDetails.name = req.body.name;
      if (req.body.email) userDetails.email = req.body.email;
    }

    const conversation = await Support.getOrCreateConversation(sessionToken, userDetails);
    const messages = await Support.getMessages(conversation.id, 0);

    // Mark messages read by user
    await Support.markMessagesRead(conversation.id, 'user');

    return res.json({
      success: true,
      sessionToken,
      conversation,
      messages,
      faqItems: FAQ_KNOWLEDGE_BASE
    });
  } catch (error) {
    console.error('Support init error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const sendMessage = async (req, res) => {
  try {
    const sessionToken = req.body.session_token || req.headers['x-support-token'];
    if (!sessionToken) {
      return res.status(400).json({ success: false, error: 'Oturum belirteci gerekli.' });
    }

    const conversation = await Support.getConversationByToken(sessionToken);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Görüşme bulunamadı.' });
    }

    const messageText = String(req.body.message || '').trim();
    if (!messageText) {
      return res.status(400).json({ success: false, error: 'Mesaj boş olamaz.' });
    }

    let senderName = conversation.user_name || 'Ziyaretçi';
    let senderId = null;

    if (req.session && req.session.userId) {
      const user = await User.findById(req.session.userId);
      if (user) {
        senderId = user.id;
        senderName = user.full_name;
      }
    }

    const savedMessage = await Support.sendMessage({
      conversationId: conversation.id,
      senderType: 'user',
      senderId,
      senderName,
      message: messageText
    });

    // Check if user clicked a quick FAQ topic
    if (faqKey && FAQ_KNOWLEDGE_BASE[faqKey]) {
      const faq = FAQ_KNOWLEDGE_BASE[faqKey];
      await Support.sendMessage({
        conversationId: conversation.id,
        senderType: 'system',
        senderName: conversation.agent_name || 'CYPILAN Destek',
        message: `${faq.title}\n\n${faq.answer}\n\nBaşka bir konuda bilgi almak ister misiniz? Canlı destek ekibimize dilediğiniz zaman yazabilirsiniz.`
      });
    }

    return res.json({
      success: true,
      message: savedMessage
    });
  } catch (error) {
    console.error('Support send message error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const pollMessages = async (req, res) => {
  try {
    const sessionToken = req.query.token || req.headers['x-support-token'];
    if (!sessionToken) {
      return res.status(400).json({ success: false, error: 'Oturum belirteci gerekli.' });
    }

    const conversation = await Support.getConversationByToken(sessionToken);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Görüşme bulunamadı.' });
    }

    const afterId = parseInt(req.query.after, 10) || 0;
    const messages = await Support.getMessages(conversation.id, afterId);

    if (messages.length > 0) {
      await Support.markMessagesRead(conversation.id, 'user');
    }

    return res.json({
      success: true,
      status: conversation.status,
      assignedAdmin: conversation.assigned_admin_id,
      messages
    });
  } catch (error) {
    console.error('Support poll error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const rateChat = async (req, res) => {
  try {
    const sessionToken = req.body.session_token || req.headers['x-support-token'];
    const rating = parseInt(req.body.rating, 10);
    const comment = req.body.comment;

    if (!sessionToken) {
      return res.status(400).json({ success: false, error: 'Oturum belirteci gerekli.' });
    }

    const conversation = await Support.getConversationByToken(sessionToken);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Görüşme bulunamadı.' });
    }

    await Support.rateConversation(conversation.id, rating, comment);
    return res.json({ success: true });
  } catch (error) {
    console.error('Support rate error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const closeChat = async (req, res) => {
  try {
    const sessionToken = req.body.session_token || req.headers['x-support-token'];
    if (!sessionToken) {
      return res.status(400).json({ success: false, error: 'Oturum belirteci gerekli.' });
    }

    const conversation = await Support.getConversationByToken(sessionToken);
    if (conversation) {
      await Support.updateStatus(conversation.id, 'closed');
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Support close error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ---- Admin Endpoints --------------------------------------------------------

const adminPanel = async (req, res, next) => {
  try {
    const [stats, conversationsList, pendingSupport] = await Promise.all([
      Support.getStats(),
      Support.listConversations({
        status: req.query.status || 'all',
        page: parseInt(req.query.page, 10) || 1,
        limit: 30,
        search: req.query.q || ''
      }),
      Support.countWaiting()
    ]);

    res.locals.meta = res.locals.meta || {};
    res.locals.meta.title = 'Canlı Destek Yönetimi | CYPILAN Admin';

    res.render('admin/support', {
      layout: 'admin/layout',
      activePage: 'support',
      title: 'Canlı Destek Yönetimi',
      stats,
      conversations: conversationsList.data,
      pagination: {
        currentPage: conversationsList.page,
        totalPages: conversationsList.totalPages,
        totalItems: conversationsList.total
      },
      currentStatus: req.query.status || 'all',
      searchQuery: req.query.q || '',
      pendingSupport
    });
  } catch (error) {
    console.error('Admin support panel error:', error);
    next(error);
  }
};

const adminListConversations = async (req, res) => {
  try {
    const conversationsList = await Support.listConversations({
      status: req.query.status || 'all',
      page: parseInt(req.query.page, 10) || 1,
      limit: parseInt(req.query.limit, 10) || 30,
      search: req.query.search || ''
    });

    const pendingCount = await Support.countWaiting();

    return res.json({
      success: true,
      pendingCount,
      ...conversationsList
    });
  } catch (error) {
    console.error('Admin list conversations error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const adminGetMessages = async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10);
    if (!Number.isInteger(conversationId)) {
      return res.status(400).json({ success: false, error: 'Geçersiz görüşme ID.' });
    }

    const conversation = await Support.getConversationById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Görüşme bulunamadı.' });
    }

    const afterId = parseInt(req.query.after, 10) || 0;
    const messages = await Support.getMessages(conversationId, afterId);

    // Mark admin read
    await Support.markMessagesRead(conversationId, 'admin');

    return res.json({
      success: true,
      conversation,
      messages
    });
  } catch (error) {
    console.error('Admin get messages error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const adminReply = async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10);
    const messageText = String(req.body.message || '').trim();

    if (!Number.isInteger(conversationId) || !messageText) {
      return res.status(400).json({ success: false, error: 'Görüşme ID ve mesaj zorunludur.' });
    }

    const savedMessage = await Support.sendMessage({
      conversationId,
      senderType: 'admin',
      senderId: req.session.userId,
      senderName: null, // Resolves to representative persona e.g. "Cansu (Müşteri Temsilcisi)"
      message: messageText
    });

    return res.json({
      success: true,
      message: savedMessage
    });
  } catch (error) {
    console.error('Admin reply error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const adminSetStatus = async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10);
    const status = req.body.status;

    if (!Number.isInteger(conversationId) || !['waiting', 'active', 'closed'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Geçersiz parametreler.' });
    }

    const updated = await Support.updateStatus(conversationId, status, req.session.userId);
    return res.json({ success: true, conversation: updated });
  } catch (error) {
    console.error('Admin set status error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

const adminDeleteConversation = async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10);
    if (!Number.isInteger(conversationId)) {
      return res.status(400).json({ success: false, error: 'Geçersiz ID.' });
    }

    await Support.deleteConversation(conversationId);
    return res.json({ success: true });
  } catch (error) {
    console.error('Admin delete conversation error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  initChat,
  sendMessage,
  pollMessages,
  rateChat,
  closeChat,
  adminPanel,
  adminListConversations,
  adminGetMessages,
  adminReply,
  adminSetStatus,
  adminDeleteConversation
};
