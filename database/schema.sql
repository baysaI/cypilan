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
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  reason TEXT NOT NULL CHECK(reason IN ('wrong_category', 'misleading_price', 'missing_photos', 'spam', 'fraud', 'inappropriate', 'other')),
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
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id, is_read);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
