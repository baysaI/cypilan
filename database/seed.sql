-- Demo Admin User (Email: admin@cypilan.com | Password: ADMIN_SIFRESI)
INSERT OR IGNORE INTO users (id, email, password_hash, full_name, phone, role, is_verified, is_active) VALUES
(1, 'admin@cypilan.com', '$2a$10$REPLACED.ADMIN.HASH.SET.ADMIN_PASSWORD.IN.ENV.xxxxxxxx', 'System Admin', '+90 533 000 0000', 'admin', 1, 1);

-- Main Categories
INSERT OR IGNORE INTO categories (id, parent_id, slug, name_tr, name_en, icon, sort_order) VALUES
(1, NULL, 'emlak', 'Emlak', 'Real Estate', 'home', 1),
(2, NULL, 'vasita', 'Vasıta', 'Vehicles', 'car', 2),
(3, NULL, 'is-ilanlari', 'İş İlanları', 'Jobs', 'briefcase', 3),
(4, NULL, 'usta-hizmetler', 'Usta & Hizmetler', 'Services', 'wrench', 4),
(5, NULL, 'ikinci-el', 'İkinci El', 'Second Hand', 'couch', 5);

-- Subcategories (Emlak)
INSERT OR IGNORE INTO categories (id, parent_id, slug, name_tr, name_en, sort_order) VALUES
(101, 1, 'satilik-daire', 'Satılık Daire', 'Apartment for Sale', 1),
(102, 1, 'kiralik-daire', 'Kiralık Daire', 'Apartment for Rent', 2),
(103, 1, 'satilik-villa', 'Satılık Villa', 'Villa for Sale', 3),
(104, 1, 'arsa', 'Arsa', 'Land', 4);

-- Subcategories (Vasıta)
INSERT OR IGNORE INTO categories (id, parent_id, slug, name_tr, name_en, sort_order) VALUES
(201, 2, 'otomobil', 'Otomobil', 'Cars', 1),
(202, 2, 'motosiklet', 'Motosiklet', 'Motorcycles', 2),
(203, 2, 'ticari-araclar', 'Ticari Araçlar', 'Commercial Vehicles', 3);

-- Subcategories (İş İlanları)
INSERT OR IGNORE INTO categories (id, parent_id, slug, name_tr, name_en, sort_order) VALUES
(301, 3, 'tam-zamanli', 'Tam Zamanlı', 'Full Time', 1),
(302, 3, 'yari-zamanli', 'Yarı Zamanlı', 'Part Time', 2);

-- Subcategories (Usta & Hizmetler)
INSERT OR IGNORE INTO categories (id, parent_id, slug, name_tr, name_en, sort_order) VALUES
(401, 4, 'temizlik', 'Temizlik', 'Cleaning', 1),
(402, 4, 'tadilat-dekorasyon', 'Tadilat & Dekorasyon', 'Renovation & Decoration', 2),
(403, 4, 'nakliyat', 'Nakliyat', 'Transportation', 3);

-- Subcategories (İkinci El)
INSERT OR IGNORE INTO categories (id, parent_id, slug, name_tr, name_en, sort_order) VALUES
(501, 5, 'elektronik', 'Elektronik', 'Electronics', 1),
(502, 5, 'mobilya', 'Mobilya', 'Furniture', 2),
(503, 5, 'giyim', 'Giyim', 'Clothing', 3);
