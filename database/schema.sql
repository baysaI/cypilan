-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT DEFAULT 'user' CHECK(role IN ('user', 'business', 'agent', 'admin')),
  avatar_url TEXT,
  bio TEXT,
  company_name TEXT,
  language_pref TEXT DEFAULT 'tr',
  currency_pref TEXT DEFAULT 'GBP',
  is_verified INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  show_phone INTEGER DEFAULT 1,
  show_surname INTEGER DEFAULT 0,
  has_password INTEGER DEFAULT 1,
  password_reset_token TEXT,
  password_reset_expires DATETIME,
  email_verification_token TEXT,
  email_verification_expires DATETIME,
  last_seen_at DATETIME,
  corporate_status TEXT DEFAULT 'none',
  corporate_tax_no TEXT,
  corporate_type TEXT,
  corporate_applied_at DATETIME,
  corporate_reviewed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Categories (self-referencing for subcategories)
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER REFERENCES categories(id),
  slug TEXT UNIQUE NOT NULL,
  name_tr TEXT NOT NULL,
  name_en TEXT,
  name_el TEXT,
  name_ru TEXT,
  name_fa TEXT,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1
);

-- Listings (polymorphic — works for all modules)
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  price REAL,
  currency TEXT DEFAULT 'GBP' CHECK(currency IN ('TRY', 'GBP')),
  listing_type TEXT DEFAULT 'sale' CHECK(listing_type IN ('sale', 'rent', 'job', 'service', 'bid_request', 'wanted')),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'sold', 'expired', 'rejected', 'draft')),
  location_city TEXT,
  location_district TEXT,
  location_lat REAL,
  location_lng REAL,
  views_count INTEGER DEFAULT 0,
  is_premium INTEGER DEFAULT 0,
  is_featured INTEGER DEFAULT 0,
  -- Seller-declared attention flags. See config/listingBadges.js: unlike the two
  -- above, these are free and unverified, which is why they never affect ranking.
  is_urgent INTEGER DEFAULT 0,
  is_opportunity INTEGER DEFAULT 0,
  is_negotiable INTEGER DEFAULT 0,
  -- Uyenin ilani vitrinin tepesine firlattigi an. Bos ise ilan sirasini
  -- yayin tarihinden aliyor.
  boosted_at DATETIME,
  expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Listing Images
CREATE TABLE IF NOT EXISTS listing_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  is_primary INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Listing Attributes (EAV pattern for module-specific fields)
CREATE TABLE IF NOT EXISTS listing_attributes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  attribute_key TEXT NOT NULL,
  attribute_value TEXT
);

-- Reviews
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reviewer_id INTEGER NOT NULL REFERENCES users(id),
  reviewed_user_id INTEGER NOT NULL REFERENCES users(id),
  listing_id INTEGER REFERENCES listings(id),
  rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL REFERENCES users(id),
  receiver_id INTEGER NOT NULL REFERENCES users(id),
  listing_id INTEGER REFERENCES listings(id),
  content TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Favorites
CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, listing_id)
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  listing_id INTEGER REFERENCES listings(id),
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'TRY',
  payment_type TEXT CHECK(payment_type IN ('premium', 'featured', 'subscription', 'listing_fee')),
  payment_method TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed', 'refunded')),
  transaction_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Reports (moderation)
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT DEFAULT 'listing' CHECK(type IN ('listing', 'user')),
  listing_id INTEGER REFERENCES listings(id),
  reported_user_id INTEGER REFERENCES users(id),
  message_id INTEGER REFERENCES messages(id),
  reason TEXT NOT NULL CHECK(reason IN ('wrong_category', 'misleading_price', 'missing_photos', 'spam', 'fraud', 'inappropriate', 'harassment', 'other')),
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  admin_note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bids (for 'Sell Your Home' / 'Sell Your Car' system)
CREATE TABLE IF NOT EXISTS bids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  bidder_id INTEGER NOT NULL REFERENCES users(id),
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'TRY',
  message TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bug reports and suggestions from visitors and members alike.
--
-- Separate from `reports`, which is moderation of other people's content, and
-- from the live support chat, which is a conversation someone waits inside. This
-- is a one-way note about the site itself, and it keeps user_id nullable because
-- the people most likely to spot a broken page are the ones who never signed up.
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
CREATE INDEX IF NOT EXISTS idx_feedback_queue ON feedback(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at DESC);

-- A record of every announcement sent from the admin panel.
--
-- The notifications themselves are per-user rows that recipients may delete, so
-- they cannot answer "what did we announce, to whom, and when". This can. It is
-- also the only place that remembers the audience filter after the fact, which is
-- what stops the same announcement going out twice.
CREATE TABLE IF NOT EXISTS broadcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sent_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link_url TEXT,
  audience TEXT NOT NULL,
  audience_detail TEXT,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_broadcasts_created ON broadcasts(created_at DESC);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_listings_user ON listings(user_id);
CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category_id);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_listings_type ON listings(listing_type);
CREATE INDEX IF NOT EXISTS idx_listings_slug ON listings(slug);
CREATE INDEX IF NOT EXISTS idx_listing_attrs ON listing_attributes(listing_id, attribute_key);

-- Every listing card resolves its thumbnail with a correlated subquery against
-- listing_images. Without this the planner falls back to scanning the whole
-- table once per row on screen.
CREATE INDEX IF NOT EXISTS idx_listing_images_listing ON listing_images(listing_id, is_primary DESC, sort_order ASC);

-- Browsing is always "active listings, newest first". Indexing the pair lets
-- the planner walk the index instead of sorting the matches in a temp b-tree.
CREATE INDEX IF NOT EXISTS idx_listings_status_created ON listings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_category_status ON listings(category_id, status, created_at DESC);

-- The admin queue lists every status at once, so it cannot use the composite
-- above and would otherwise sort the whole table on each page.
CREATE INDEX IF NOT EXISTS idx_listings_created ON listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id, is_read);

-- One score per reviewer per reviewed user: a second submission updates the
-- first instead of stacking, so nobody can inflate a profile by re-posting.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_pair ON reviews(reviewer_id, reviewed_user_id);

-- One standing offer per professional per listing. Revising an offer replaces
-- it, so an owner comparing bids sees one current number per bidder, not a
-- history of every revision.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bids_pair ON bids(listing_id, bidder_id);

-- The owner's "offers I received" page and the professional's "offers I made"
-- page are the two hot reads.
CREATE INDEX IF NOT EXISTS idx_bids_listing ON bids(listing_id, status);
CREATE INDEX IF NOT EXISTS idx_bids_bidder ON bids(bidder_id, created_at DESC);

-- Professionals browse listings that are open to offers.
CREATE INDEX IF NOT EXISTS idx_listings_bid_request ON listings(listing_type, status, created_at DESC);

-- The profile page reads "this user's reviews, newest first" on every visit.
CREATE INDEX IF NOT EXISTS idx_reviews_reviewed ON reviews(reviewed_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);

-- ---------------------------------------------------------------------------
-- Careers
--
-- A job advert is an ordinary listing under the is-ilanlari tree, so it already
-- has a title, a description, a city and an owner. job_details only carries what
-- an ordinary listing has no column for — pay, contract shape, benefits — rather
-- than duplicating the listing itself.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS job_details (
  listing_id INTEGER PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  work_type TEXT DEFAULT 'full_time' CHECK(work_type IN ('full_time', 'part_time', 'contract', 'seasonal', 'internship')),
  salary_min REAL,
  salary_max REAL,
  salary_currency TEXT DEFAULT 'GBP' CHECK(salary_currency IN ('TRY', 'GBP')),
  salary_period TEXT DEFAULT 'monthly' CHECK(salary_period IN ('hourly', 'daily', 'monthly', 'yearly')),
  experience_required INTEGER DEFAULT 0,
  benefits TEXT,
  required_skills TEXT,
  required_languages TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- The CV a job seeker fills in once and applies with. Kept as one row per user
-- rather than normalised child tables: it is written by hand in a single form
-- and always read whole, so splitting it would buy nothing but joins.
CREATE TABLE IF NOT EXISTS candidate_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  headline TEXT,
  summary TEXT,
  experience_years INTEGER DEFAULT 0,
  education TEXT,
  skills TEXT,
  languages TEXT,
  certificates TEXT,
  preferred_city TEXT,
  preferred_work_type TEXT,
  is_open_to_work INTEGER DEFAULT 1,
  is_public INTEGER DEFAULT 1,
  photo_url TEXT,
  custom_cv_url TEXT,
  custom_cv_name TEXT,
  custom_cv_size INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  applicant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cover_letter TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'reviewed', 'shortlisted', 'rejected', 'withdrawn')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- One application per person per advert: re-applying updates the existing one
-- instead of flooding the employer's list with duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_pair ON job_applications(listing_id, applicant_id);

-- The employer's "applicants for this advert" and the seeker's "where I applied"
-- are the two reads that happen on every page load of those screens.
CREATE INDEX IF NOT EXISTS idx_applications_listing ON job_applications(listing_id, status);
CREATE INDEX IF NOT EXISTS idx_applications_applicant ON job_applications(applicant_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Moderation: staged warnings
--
-- Suspending an account was the only lever moderation had, which meant a first
-- offence and a repeat offender were treated identically. A warning records the
-- decision, tells the member what was wrong, and only the accumulation of them
-- reaches for the suspension.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issued_by INTEGER REFERENCES users(id),
  report_id INTEGER REFERENCES reports(id),
  reason TEXT NOT NULL CHECK(reason IN ('wrong_category', 'misleading_price', 'missing_photos', 'spam', 'fraud', 'inappropriate', 'harassment', 'other')),
  note TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_warnings_user ON user_warnings(user_id, is_active, created_at DESC);

-- ---------------------------------------------------------------------------
-- Service requests
--
-- Two of the announced services are the same shape: the member asks, a human on
-- the team acts. "Cypilan assurance" is a request to have a sale or rental run
-- by staff; "promotion" is a request to have a listing featured. Neither can be
-- self-served yet — there is no payment provider wired up — so the platform's
-- job is to capture the request, show the member where it stands, and put it in
-- a queue somebody actually works.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS service_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER REFERENCES listings(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('assurance', 'promotion')),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'contacted', 'approved', 'rejected', 'completed')),
  note TEXT,
  admin_note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- One open request per listing per service, so a member cannot flood the queue
-- by clicking twice. A settled request leaves the way clear for a new one.
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_requests_open
  ON service_requests(listing_id, type)
  WHERE status IN ('pending', 'contacted');

CREATE INDEX IF NOT EXISTS idx_service_requests_queue ON service_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_requests_user ON service_requests(user_id, created_at DESC);

-- User blocks table for blocking harassing users
CREATE TABLE IF NOT EXISTS user_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_id);

-- ---------------------------------------------------------------------------
-- Settings
--
-- Runtime switches that an admin flips from the panel rather than from a file.
-- Anything that lives in .env needs a redeploy to change, which is no use for
-- something you reach for precisely when the site is misbehaving.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS settings (
  setting_key TEXT PRIMARY KEY,
  value TEXT,
  updated_by INTEGER REFERENCES users(id),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- Page Views & Analytics
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  path TEXT NOT NULL,
  ip_hash TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_page_views_created ON page_views(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_session ON page_views(session_id);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Live Support (Canlı Destek)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS support_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_token TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT,
  user_email TEXT,
  agent_name TEXT,
  status TEXT DEFAULT 'waiting', -- 'waiting', 'active', 'closed'
  assigned_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  rating INTEGER, -- 1 to 5
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
  sender_type TEXT NOT NULL, -- 'user', 'admin', 'system'
  sender_id INTEGER,
  sender_name TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_messages_conv ON support_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_support_messages_read ON support_messages(conversation_id, is_read);

-- ---------------------------------------------------------------------------
-- Price Alerts (Fiyat Alarmı)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS price_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  target_price REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_user ON price_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_listing ON price_alerts(listing_id);

-- ---------------------------------------------------------------------------
-- Sorgu planlari EXPLAIN QUERY PLAN ile olculdu: asagidaki her sorgu bu
-- indeksler olmadan tabloyu bastan sona tariyordu. Bugunku veri boyutunda
-- fark edilmiyor, buyudukce fark ediliyor.
-- ---------------------------------------------------------------------------

-- Sifre sifirlama ve e-posta dogrulama, jetonu users tablosunda ariyor.
-- Jeton kolonlari neredeyse her satirda NULL, bu yuzden indeksler kismi:
-- yalnizca acik bir jetonu olan satirlari tutuyorlar.
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(password_reset_token) WHERE password_reset_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(email_verification_token) WHERE email_verification_token IS NOT NULL;

-- Yonetici panelindeki kullanici listesi role gore suzup tarihe gore siraliyor.
-- Iki kolon birlikte indekslenince siralama icin gecici B-tree kurulmasi da
-- gerekmiyor.
CREATE INDEX IF NOT EXISTS idx_users_role_created ON users(role, created_at DESC);

-- Bekleyen sikayet sayaci yonetici sayfalarinda, ayni ilana acik sikayet
-- kontrolu ise her sikayet gonderiminde calisiyor.
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_listing ON reports(listing_id, status);

-- Gelen kutusu hem gonderen hem alan tarafi ariyor; yalnizca alici tarafi
-- indeksliydi, dolayisiyla sorgunun yarisi tarama yapiyordu.
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id, created_at DESC);

-- Bir ilan silinirken favorilerden temizlenmesi gerekiyor.
CREATE INDEX IF NOT EXISTS idx_favorites_listing ON favorites(listing_id);

-- ---------------------------------------------------------------------------
-- Vitrine firlatma kayitlari
-- ---------------------------------------------------------------------------
-- Haftalik hak bu tablodan sayiliyor, listings.boosted_at uzerinden degil:
-- ayni ilani ikinci kez firlatmak boosted_at alanini gunceller ve sayim
-- yapilmis bir firlatmayi gormezden gelirdi. Her firlatma burada ayri bir
-- satir, yani hak sayimi da gecmis de dogru.
-- listing_id CASCADE degil SET NULL: kayit ilanla birlikte silinseydi haftalik
-- hak da iade edilirdi ve firlat-sil-firlat dongusu sinirsiz olurdu. Kayit
-- kaliyor, hak harcanmis sayiliyor.
--
-- listing_title, firlatma anindaki basligin kopyasi: ilan silindikten sonra
-- yonetici kaydinda "silinmis ilan" yerine neyin one cikarildigi goruluyor.
CREATE TABLE IF NOT EXISTS listing_boosts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER REFERENCES listings(id) ON DELETE SET NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_title TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_listing_boosts_user ON listing_boosts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listing_boosts_listing ON listing_boosts(listing_id);


-- ---------------------------------------------------------------------------
-- Yonetici tarafindan verilen uye rozetleri
-- ---------------------------------------------------------------------------
-- Rozetin ne oldugunu config/userBadges.js soyluyor; burada yalnizca anahtari
-- duruyor. Katalog degistiginde veritabani semasina dokunmak gerekmesin diye
-- CHECK listesi yok: karsiligi kalmamis bir anahtar profil sayfasini
-- dusurmuyor, notr bir rozet olarak basiliyor.
--
-- UNIQUE(user_id, badge_key): ayni rozeti ikinci kez vermek uzatmadir,
-- kopyalama degil. Ayin Emlakcisi'ni ust uste iki ay ayni kisiye vermek bitis
-- tarihini oteliyor, profilinde iki ayni etiket birakmiyor.
--
-- expires_at bos ise rozet kalici. Donemsel unvanlar kendiliginden dusuyor:
-- bir yil boyunca duran "Ayin Emlakcisi" hic rozet olmamasindan daha kotu,
-- cunku ikinci ayin kazanani unvani dolu buluyor.
--
-- user_id CASCADE: silinmis bir uyenin rozetinin anlami yok. granted_by ise
-- SET NULL, rozeti veren yonetici hesabi kapansa da rozet yerinde kaliyor.
CREATE TABLE IF NOT EXISTS user_badges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_key TEXT NOT NULL,
  note TEXT,
  granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  UNIQUE(user_id, badge_key)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id, granted_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_badges_key ON user_badges(badge_key, expires_at);
