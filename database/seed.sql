-- Demo Admin & Demo Users
INSERT OR IGNORE INTO users (id, email, password_hash, full_name, phone, role, is_verified, is_active) VALUES
(1, 'admin@cypilan.com', '$2a$10$REPLACED.ADMIN.HASH.SET.ADMIN_PASSWORD.IN.ENV.xxxxxxxx', 'System Admin', '+90 533 000 0000', 'admin', 1, 1),
(2, 'ahmet@cypilan.com', '$2a$10$REPLACED.ADMIN.HASH.SET.ADMIN_PASSWORD.IN.ENV.xxxxxxxx', 'Ahmet Yılmaz', '+90 533 111 2233', 'user', 1, 1),
(3, 'elena@cypilan.com', '$2a$10$REPLACED.ADMIN.HASH.SET.ADMIN_PASSWORD.IN.ENV.xxxxxxxx', 'Elena Smith', '+90 548 888 9900', 'business', 1, 1);

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

-- Sample Listings (Connected to SQL DB)
INSERT OR IGNORE INTO listings (id, user_id, category_id, title, slug, description, price, currency, listing_type, status, location_city, location_district, is_featured, is_premium, views_count) VALUES
(1, 2, 101, 'Girne Merkezde Deniz Manzaralı Lüks 3+1 Daire', 'girne-merkezde-deniz-manzarali-luks-31-daire', 'Girne merkeze 5 dakika mesafede, kesintisiz deniz ve dağ manzaralı, koçanı hazır lüks 3+1 daire.', 145000, 'GBP', 'sale', 'active', 'Girne', 'Merkez', 1, 1, 342),
(2, 3, 201, '2022 Model Mercedes-Benz C200 AMG - Borusan Çıkışlı', '2022-model-mercedes-benz-c200-amg', 'Hatasız, boyasız, düşük kilometrede, tüm bakımları yetkili serviste yapılmış Mercedes C200 AMG.', 48500, 'GBP', 'sale', 'active', 'Lefkoşa', 'Gönyeli', 1, 1, 518),
(3, 2, 103, 'İskele Long Beach Bölgesinde Özel Havuzlu Müstakil Villa', 'iskele-long-beach-ozel-havuzlu-villa', 'Denize 300m mesafede, geniş bahçeli, özel yüzme havuzlu ve kapalı garajlı ultra lüks villa.', 320000, 'GBP', 'sale', 'active', 'İskele', 'Long Beach', 1, 1, 289),
(4, 3, 501, 'Temiz İkinci El Apple iPhone 14 Pro Max 256GB', 'temiz-ikinci-el-iphone-14-pro-max-256gb', 'Pil sağlığı %92, kutulu, faturalı, kozmetik olarak 10/10 durumda sorunsuz cihaz.', 34500, 'TRY', 'sale', 'active', 'Gazimağusa', 'Doğu Akdeniz', 1, 0, 194),
(5, 2, 102, 'Lefkoşa Küçük Kaymaklıda Eşyalı Kiralık 2+1 Daire', 'lefkosa-kucuk-kaymaklida-esyali-kiralik-21-daire', 'Üniversitelere ve otobüs durağına yakın, tam eşyalı, klimalı ve asansörlü 2+1 daire.', 550, 'GBP', 'rent', 'active', 'Lefkoşa', 'Küçük Kaymaklı', 0, 0, 412),
(6, 3, 201, '2019 Nissan Qashqai 1.5 dCi Tekna - Otomatik', '2019-nissan-qashqai-15-dci-tekna', 'Ekonomik dizel motor, panoramik cam tavan, geri görüş kamerası ve şerit takip sistemi.', 16800, 'GBP', 'sale', 'active', 'Girne', 'Alsancak', 0, 0, 230),
(7, 2, 301, 'Lefkoşada Senior Full-Stack Web Geliştirici Aranıyor', 'lefkosa-senior-full-stack-web-gelistirici', 'Node.js, React ve SQL tecrübesi olan, hibrit çalışma modeline uygun geliştirici takım arkadaşı aranıyor.', 65000, 'TRY', 'job', 'active', 'Lefkoşa', 'Dereboyu', 1, 0, 156),
(8, 3, 402, 'Kıbrıs Genelinde Profesyonel Ev & Ofis Tadilat Hizmetleri', 'kibris-genelinde-profesyonel-ev-ofis-tadilat', 'Boya, alçıpan, fayans, su ve elektrik tesisatı alanında 15 yıllık tecrübeli usta kadrosu.', 1500, 'TRY', 'service', 'active', 'Girne', 'Lapta', 1, 0, 98);

-- Listing Images
INSERT OR IGNORE INTO listing_images (id, listing_id, image_url, is_primary) VALUES
(1, 1, 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800', 1),
(2, 2, 'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=800', 1),
(3, 3, 'https://images.unsplash.com/photo-1613977257363-707ba9348227?w=800', 1),
(4, 4, 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=800', 1),
(5, 5, 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800', 1),
(6, 6, 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800', 1),
(7, 7, 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800', 1),
(8, 8, 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800', 1);
