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
  currency_pref TEXT DEFAULT 'TRY',
  is_verified INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  show_phone INTEGER DEFAULT 1,
  has_password INTEGER DEFAULT 1,
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
  currency TEXT DEFAULT 'TRY' CHECK(currency IN ('TRY', 'GBP')),
  listing_type TEXT DEFAULT 'sale' CHECK(listing_type IN ('sale', 'rent', 'job', 'service', 'bid_request')),
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'sold', 'expired', 'rejected', 'draft')),
  location_city TEXT,
  location_district TEXT,
  location_lat REAL,
  location_lng REAL,
  views_count INTEGER DEFAULT 0,
  is_premium INTEGER DEFAULT 0,
  is_featured INTEGER DEFAULT 0,
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
