const t = require('./helpers');

const Support = require(t.rootDir + '/models/Support');
const User = require(t.rootDir + '/models/User');

t.run('Canlı Destek Sistemi', async (db) => {
  const adminId = t.makeUser(db, 'admin-support@test.local', 'Destek Uzmanı', 'admin');
  const userId = t.makeUser(db, 'user-support@test.local', 'Mustafa Müşteri', 'user');

  // 1. Misafir Ziyaretçi Oturumu Başlatma
  const guestToken = 'guest-session-token-12345';
  const guestConv = await Support.getOrCreateConversation(guestToken, { name: 'Ahmet Misafir' });

  t.assert(guestConv && guestConv.id, 'Misafir için yeni canlı destek görüşmesi oluşturuldu');
  t.assertEqual(guestConv.status, 'waiting', 'Yeni görüşme waiting (beklemede) durumunda açıldı');
  t.assertEqual(guestConv.session_token, guestToken, 'Oturum belirteci eşleşiyor');

  // İlk sistem karşılama mesajı kontrolü
  let messages = await Support.getMessages(guestConv.id, 0);
  t.assertEqual(messages.length, 1, 'Başlangıçta 1 adet sistem karşılama mesajı mevcut');
  t.assertEqual(messages[0].sender_type, 'system', 'İlk mesaj sistem tarafından atıldı');

  // 2. Kullanıcı Mesaj Gönderme
  const userMsg = await Support.sendMessage({
    conversationId: guestConv.id,
    senderType: 'user',
    senderId: null,
    senderName: 'Ahmet Misafir',
    message: 'Merhaba, ilan vermek istiyorum ama hata alıyorum.'
  });

  t.assert(userMsg && userMsg.id, 'Kullanıcı mesajı veritabanına yazıldı');

  const afterUserConv = await Support.getConversationById(guestConv.id);
  t.assertEqual(afterUserConv.unread_admin_count, 1, 'Yönetici için 1 okunmamış mesaj sayısı arttı');
  t.assertEqual(afterUserConv.last_message, 'Merhaba, ilan vermek istiyorum ama hata alıyorum.', 'Son mesaj güncellendi');

  // 3. Mesajları Polling & Okundu İşaretleme
  const newMsgs = await Support.getMessages(guestConv.id, messages[0].id);
  t.assertEqual(newMsgs.length, 1, 'afterId filtresi ile sadece yeni mesajlar çekildi');

  await Support.markMessagesRead(guestConv.id, 'admin');
  const readConv = await Support.getConversationById(guestConv.id);
  t.assertEqual(readConv.unread_admin_count, 0, 'Yönetici okuyunca unread_admin_count 0 oldu');

  // Kullanıcı karşılama mesajını okuyor
  await Support.markMessagesRead(guestConv.id, 'user');

  // 4. Yönetici / Destek Temsilcisi Yanıtı
  const adminMsg = await Support.sendMessage({
    conversationId: guestConv.id,
    senderType: 'admin',
    senderId: adminId,
    senderName: 'Destek Uzmanı',
    message: 'Merhaba Ahmet Bey, aldığınız hatanın ekran görüntüsünü veya metnini iletebilir misiniz?'
  });

  t.assert(adminMsg && adminMsg.id, 'Destek temsilcisi yanıtı kaydedildi');

  const afterAdminConv = await Support.getConversationById(guestConv.id);
  t.assertEqual(afterAdminConv.status, 'active', 'Destek yanıt verince görüşme aktif duruma geçti');
  t.assertEqual(afterAdminConv.unread_user_count, 1, 'Kullanıcı için okunmamış mesaj sayısı 1 oldu');
  t.assertEqual(afterAdminConv.assigned_admin_id, adminId, 'Destek temsilcisi görüşmeye atandı');

  // 5. Durum Değiştirme & Kapatma
  await Support.updateStatus(guestConv.id, 'closed', adminId);
  const closedConv = await Support.getConversationById(guestConv.id);
  t.assertEqual(closedConv.status, 'closed', 'Görüşme kapatıldı');

  // 6. Değerlendirme (Puanlama & Yorum)
  await Support.rateConversation(guestConv.id, 5, 'Çok hızlı ve yardımcı oldular, teşekkürler!');
  const ratedConv = await Support.getConversationById(guestConv.id);
  t.assertEqual(ratedConv.rating, 5, '5 yıldız memnuniyet puanı kaydedildi');
  t.assertEqual(ratedConv.rating_comment, 'Çok hızlı ve yardımcı oldular, teşekkürler!', 'Puanlama yorumu kaydedildi');

  // 7. İstatistikler
  const stats = await Support.getStats();
  t.assert(stats.total >= 1, 'Toplam görüşme sayısı istatistiklerde mevcut');
  t.assert(stats.avgRating >= 4.0, 'Ortalama puan doğru hesaplandı');

  // 8. Kayıtlı Üye ile İkinci Görüşme Testi
  const userToken = 'user-session-token-998877';
  const memberUser = await User.findById(userId);
  const memberConv = await Support.getOrCreateConversation(userToken, {
    userId: memberUser.id,
    name: memberUser.full_name,
    email: memberUser.email
  });

  t.assertEqual(memberConv.user_id, userId, 'Kayıtlı üye ID görüşmeyle ilişkilendirildi');
  t.assertEqual(memberConv.user_name, 'Mustafa Müşteri', 'Kullanıcı adı kaydedildi');

  // 9. Görüşme Listeleme
  const list = await Support.listConversations({ status: 'all', page: 1, limit: 10 });
  t.assert(list.data.length >= 2, 'Görüşme listesi çekildi');

  // 10. Şablon Render Testleri
  const widgetHtml = await t.render('partials/liveSupport.ejs', {
    csrfToken: 'test-csrf-token'
  });
  t.assert(widgetHtml.includes('cypilanSupportWidget'), 'liveSupport.ejs widget ana kapsayıcısını içeriyor');
  t.assert(widgetHtml.includes('cypSupportLauncher'), 'liveSupport.ejs tetikleyici butonu içeriyor');
  t.assert(widgetHtml.includes('cypSupportWindow'), 'liveSupport.ejs sohbet penceresini içeriyor');

  const adminSupportHtml = await t.render('admin/support.ejs', {
    activePage: 'support',
    title: 'Canlı Destek Yönetimi',
    stats,
    conversations: list.data,
    pagination: { currentPage: 1, totalPages: 1, totalItems: list.total },
    currentStatus: 'all',
    searchQuery: '',
    pendingSupport: 0,
    csrfToken: 'test-csrf-token',
    helpers: {
      formatRelativeTime: () => 'Az önce'
    }
  });

  t.assert(adminSupportHtml.includes('Canlı Destek Yönetimi'), 'admin/support.ejs başlığı render ediyor');
  t.assert(adminSupportHtml.includes('adminConversationsList'), 'admin/support.ejs görüşme listesi kapsayıcısını içeriyor');
  t.assert(adminSupportHtml.includes('adminReplyForm'), 'admin/support.ejs yanıt formunu içeriyor');

  // 11. 5 Dilde Dil Anahtarları Kontrolü
  const allLangs = ['tr', 'en', 'el', 'ru', 'fa'].every((lang) =>
    ['support.live_support', 'support.header_title', 'support.online_status', 'support.rate_title']
      .every((key) => t.translate(key, lang) !== key)
  );
  t.assert(allLangs, 'support.* anahtarları 5 dilde eksiksiz çözülüyor');
});
