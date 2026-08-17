const { getDb } = require('../config/database');

console.log('🚀 Cypilan Veritabanı Migrasyonu Başlatılıyor...');

const db = getDb();

db.exec(`
  -- 1. Geri Bildirim Tablosu (Feedback)
  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK(type IN ('bug', 'suggestion', 'other')),
    message TEXT NOT NULL,
    contact_email TEXT,
    page_url TEXT,
    status TEXT DEFAULT 'new' CHECK(status IN ('new', 'read', 'resolved')),
    admin_note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at DESC);

  -- 2. Toplu Bildirim / Duyuru Tablosu (Broadcasts)
  CREATE TABLE IF NOT EXISTS broadcasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link_url TEXT,
    audience TEXT NOT NULL,
    audience_detail TEXT,
    recipient_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_broadcasts_created ON broadcasts(created_at DESC);

  -- 3. Bildirimler Tablosu (Notifications)
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link_url TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

  -- 4. Canlı Destek Tabloları
  CREATE TABLE IF NOT EXISTS support_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_token TEXT NOT NULL UNIQUE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    user_name TEXT,
    user_email TEXT,
    agent_name TEXT,
    status TEXT DEFAULT 'waiting',
    assigned_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    rating INTEGER,
    rating_comment TEXT,
    unread_user_count INTEGER DEFAULT 0,
    unread_admin_count INTEGER DEFAULT 0,
    last_message TEXT,
    last_message_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_support_conversations_token ON support_conversations(session_token);
  CREATE INDEX IF NOT EXISTS idx_support_conversations_status ON support_conversations(status, updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_support_conversations_user ON support_conversations(user_id);

  CREATE TABLE IF NOT EXISTS support_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL,
    sender_id INTEGER,
    sender_name TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_support_messages_conv ON support_messages(conversation_id, created_at ASC);
  CREATE INDEX IF NOT EXISTS idx_support_messages_read ON support_messages(conversation_id, is_read);
`);

console.log('✅ Tüm yeni tablolar ve indeksler başarıyla oluşturuldu/güncellendi!');
process.exit(0);
