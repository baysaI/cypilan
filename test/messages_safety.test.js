const t = require('./helpers');

t.run('Mesajlaşma Güvenlik & Politika Uyarısı Bannerı', async (db) => {
  const sender = t.makeUser(db, 'sender_safety@test.local', 'Ali Veli');
  const receiver = t.makeUser(db, 'recv_safety@test.local', 'Mehmet Yılmaz');

  const html = await t.render('messages/conversation.ejs', {
    currentUser: { id: sender, full_name: 'Ali Veli' },
    otherUser: { id: receiver, full_name: 'Mehmet Yılmaz', show_surname: 0 },
    listing: null,
    messages: [],
    isBlockedByMe: false,
    isBlockedByOther: false,
    csrfToken: 'dummy-token',
    title: 'Mesajlar'
  });

  t.assert(html.includes('fa-shield-halved'), 'Güvenlik kalkanı ikonu var');
  t.assert(html.includes('Güvenli İletişim') || html.includes('Safe Communication'), 'Güvenlik uyarısı başlığı render ediliyor');
  t.assert(html.includes('Cypilan') || html.includes('staff'), 'Yönetici şifre/para istemez uyarısı render ediliyor');
  t.assert(html.includes('kapora') || html.includes('deposit'), 'Kapora/ön ödeme uyarısı render ediliyor');
  t.assert(html.includes('bayrak') || html.includes('flag'), 'Şüpheli durum bildirme uyarısı render ediliyor');
  t.assert(html.includes('Mehmet Y.'), 'Alıcının soyadı gizlenerek (Mehmet Y.) gösteriliyor');
});
