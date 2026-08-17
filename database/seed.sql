-- The admin account is created by config/database.js (ensureAdminUser) so its
-- password is never committed to the repository.

-- Main Categories
INSERT OR IGNORE INTO categories (id, parent_id, slug, name_tr, icon, sort_order) VALUES
(1, NULL, 'emlak', 'Emlak', 'home', 1),
(2, NULL, 'vasita', 'Vasıta', 'car', 2),
(3, NULL, 'is-ilanlari', 'İş İlanları', 'briefcase', 3),
(4, NULL, 'usta-hizmetler', 'Usta & Hizmetler', 'wrench', 4),
(5, NULL, 'ikinci-el', 'İkinci El', 'couch', 5),
(6, NULL, 'kurumsal-tedarikci', 'Kurumsal Tedarikçi Ağı', 'industry', 6);

-- Subcategories (Emlak)
INSERT OR IGNORE INTO categories (id, parent_id, slug, name_tr, sort_order) VALUES
(101, 1, 'satilik-daire', 'Satılık Daire', 1),
(102, 1, 'kiralik-daire', 'Kiralık Daire', 2),
(103, 1, 'satilik-villa', 'Satılık Villa', 3),
(104, 1, 'arsa', 'Arsa', 4),
(105, 1, 'kiralik-villa', 'Kiralık Villa', 5),
(106, 1, 'satilik-isyeri', 'Satılık İşyeri', 6),
(107, 1, 'kiralik-isyeri', 'Kiralık İşyeri', 7),
(108, 1, 'ev-arkadasi', 'Ev Arkadaşı', 8),
(109, 1, 'ogrenci-evi', 'Öğrenci Evi', 9);

-- Subcategories (Vasıta)
INSERT OR IGNORE INTO categories (id, parent_id, slug, name_tr, sort_order) VALUES
(201, 2, 'otomobil', 'Otomobil', 1),
(202, 2, 'motosiklet', 'Motosiklet', 2),
(203, 2, 'ticari-araclar', 'Ticari Araçlar', 3),
(204, 2, 'suv-arazi', 'SUV & Arazi', 4),
(205, 2, 'pickup', 'Pickup', 5);

-- Subcategories (İş İlanları)
INSERT OR IGNORE INTO categories (id, parent_id, slug, name_tr, sort_order) VALUES
(301, 3, 'tam-zamanli', 'Tam Zamanlı', 1),
(302, 3, 'yari-zamanli', 'Yarı Zamanlı', 2);

-- Subcategories (Usta & Hizmetler)
INSERT OR IGNORE INTO categories (id, parent_id, slug, name_tr, sort_order) VALUES
(401, 4, 'temizlik', 'Temizlik', 1),
(402, 4, 'tadilat-dekorasyon', 'Tadilat & Dekorasyon', 2),
(403, 4, 'nakliyat', 'Nakliyat', 3);

-- Subcategories (İkinci El)
INSERT OR IGNORE INTO categories (id, parent_id, slug, name_tr, sort_order) VALUES
(501, 5, 'elektronik', 'Elektronik', 1),
(502, 5, 'mobilya', 'Mobilya', 2),
(503, 5, 'giyim', 'Giyim', 3);

-- Subcategories (Kurumsal Tedarikçi Ağı — toptan ve inşaat malzemeleri)
INSERT OR IGNORE INTO categories (id, parent_id, slug, name_tr, sort_order) VALUES
(601, 6, 'insaat-malzemeleri', 'İnşaat Malzemeleri', 1),
(602, 6, 'hirdavat-nalburiye', 'Hırdavat & Nalburiye', 2),
(603, 6, 'elektrik-aydinlatma', 'Elektrik & Aydınlatma', 3),
(604, 6, 'sihhi-tesisat-isitma', 'Sıhhi Tesisat & Isıtma', 4),
(605, 6, 'boya-yalitim', 'Boya & Yalıtım', 5),
(606, 6, 'is-makineleri-ekipman', 'İş Makineleri & Ekipman', 6),
(607, 6, 'gida-icecek-toptan', 'Gıda & İçecek Toptan', 7),
(608, 6, 'temizlik-hijyen-toptan', 'Temizlik & Hijyen Toptan', 8),
(609, 6, 'mobilya-dekorasyon-toptan', 'Mobilya & Dekorasyon Toptan', 9),
(610, 6, 'ambalaj-lojistik', 'Ambalaj & Lojistik', 10);

-- Category names in the other four languages.
-- Kept as UPDATEs because the INSERTs above are OR IGNORE: databases created
-- before these columns were filled would otherwise keep falling back to Turkish.
UPDATE categories SET name_en = 'Real Estate',           name_el = 'Ακίνητα',                   name_ru = 'Недвижимость',        name_fa = 'املاک'              WHERE slug = 'emlak';
UPDATE categories SET name_en = 'Vehicles',              name_el = 'Οχήματα',                   name_ru = 'Транспорт',           name_fa = 'وسایل نقلیه'        WHERE slug = 'vasita';
UPDATE categories SET name_en = 'Jobs',                  name_el = 'Θέσεις εργασίας',           name_ru = 'Работа',              name_fa = 'آگهی‌های شغلی'       WHERE slug = 'is-ilanlari';
UPDATE categories SET name_en = 'Trades & Services',     name_el = 'Τεχνίτες & Υπηρεσίες',      name_ru = 'Мастера и услуги',    name_fa = 'خدمات و پیشه‌وران'   WHERE slug = 'usta-hizmetler';
UPDATE categories SET name_en = 'Second Hand',           name_el = 'Μεταχειρισμένα',            name_ru = 'Б/у товары',          name_fa = 'کالای دست دوم'      WHERE slug = 'ikinci-el';
UPDATE categories SET name_en = 'Corporate Supplier Network', name_el = 'Δίκτυο Εταιρικών Προμηθευτών', name_ru = 'Сеть корпоративных поставщиков', name_fa = 'شبکه تأمین‌کنندگان شرکتی' WHERE slug = 'kurumsal-tedarikci';

UPDATE categories SET name_en = 'Apartment for Sale',    name_el = 'Διαμέρισμα προς πώληση',    name_ru = 'Квартира на продажу', name_fa = 'آپارتمان فروشی'     WHERE slug = 'satilik-daire';
UPDATE categories SET name_en = 'Apartment for Rent',    name_el = 'Διαμέρισμα προς ενοικίαση', name_ru = 'Квартира в аренду',   name_fa = 'آپارتمان اجاره‌ای'   WHERE slug = 'kiralik-daire';
UPDATE categories SET name_en = 'Villa for Sale',        name_el = 'Βίλα προς πώληση',          name_ru = 'Вилла на продажу',    name_fa = 'ویلا فروشی'         WHERE slug = 'satilik-villa';
UPDATE categories SET name_en = 'Land',                  name_el = 'Οικόπεδο',                  name_ru = 'Земельный участок',   name_fa = 'زمین'               WHERE slug = 'arsa';
UPDATE categories SET name_en = 'Villa for Rent',        name_el = 'Βίλα προς ενοικίαση',       name_ru = 'Вилла в аренду',      name_fa = 'ویلا اجاره‌ای'       WHERE slug = 'kiralik-villa';
UPDATE categories SET name_en = 'Commercial for Sale',   name_el = 'Επαγγελματικός χώρος προς πώληση', name_ru = 'Коммерческая недвижимость на продажу', name_fa = 'ملک تجاری فروشی' WHERE slug = 'satilik-isyeri';
UPDATE categories SET name_en = 'Commercial for Rent',   name_el = 'Επαγγελματικός χώρος προς ενοικίαση', name_ru = 'Коммерческая недвижимость в аренду', name_fa = 'ملک تجاری اجاره‌ای' WHERE slug = 'kiralik-isyeri';
UPDATE categories SET name_en = 'Flatmate Wanted',       name_el = 'Ζητείται συγκάτοικος',      name_ru = 'Ищу соседа по квартире', name_fa = 'هم‌خانه'          WHERE slug = 'ev-arkadasi';
UPDATE categories SET name_en = 'Student Housing',       name_el = 'Φοιτητική κατοικία',        name_ru = 'Студенческое жильё',  name_fa = 'خانه دانشجویی'      WHERE slug = 'ogrenci-evi';

UPDATE categories SET name_en = 'Cars',                  name_el = 'Αυτοκίνητα',                name_ru = 'Автомобили',          name_fa = 'خودرو'              WHERE slug = 'otomobil';
UPDATE categories SET name_en = 'Motorcycles',           name_el = 'Μοτοσικλέτες',              name_ru = 'Мотоциклы',           name_fa = 'موتورسیکلت'         WHERE slug = 'motosiklet';
UPDATE categories SET name_en = 'Commercial Vehicles',   name_el = 'Επαγγελματικά οχήματα',     name_ru = 'Коммерческий транспорт', name_fa = 'خودروهای تجاری'  WHERE slug = 'ticari-araclar';
UPDATE categories SET name_en = 'SUV & Off-Road',        name_el = 'SUV & Εκτός δρόμου',        name_ru = 'Внедорожники',        name_fa = 'شاسی‌بلند و آفرود'  WHERE slug = 'suv-arazi';
UPDATE categories SET name_en = 'Pickup',                name_el = 'Pickup',                    name_ru = 'Пикапы',              name_fa = 'وانت'               WHERE slug = 'pickup';

UPDATE categories SET name_en = 'Full Time',             name_el = 'Πλήρης απασχόληση',         name_ru = 'Полная занятость',    name_fa = 'تمام‌وقت'            WHERE slug = 'tam-zamanli';
UPDATE categories SET name_en = 'Part Time',             name_el = 'Μερική απασχόληση',         name_ru = 'Частичная занятость', name_fa = 'پاره‌وقت'            WHERE slug = 'yari-zamanli';

UPDATE categories SET name_en = 'Cleaning',              name_el = 'Καθαρισμός',                name_ru = 'Уборка',              name_fa = 'نظافت'              WHERE slug = 'temizlik';
UPDATE categories SET name_en = 'Renovation & Decoration', name_el = 'Ανακαίνιση & Διακόσμηση', name_ru = 'Ремонт и отделка',    name_fa = 'بازسازی و دکوراسیون' WHERE slug = 'tadilat-dekorasyon';
UPDATE categories SET name_en = 'Removals',              name_el = 'Μεταφορές',                 name_ru = 'Перевозки',           name_fa = 'حمل و نقل'          WHERE slug = 'nakliyat';

UPDATE categories SET name_en = 'Electronics',           name_el = 'Ηλεκτρονικά',               name_ru = 'Электроника',         name_fa = 'لوازم الکترونیکی'   WHERE slug = 'elektronik';
UPDATE categories SET name_en = 'Furniture',             name_el = 'Έπιπλα',                    name_ru = 'Мебель',              name_fa = 'مبلمان'             WHERE slug = 'mobilya';
UPDATE categories SET name_en = 'Clothing',              name_el = 'Ένδυση',                    name_ru = 'Одежда',              name_fa = 'پوشاک'              WHERE slug = 'giyim';

UPDATE categories SET name_en = 'Building Materials',    name_el = 'Οικοδομικά υλικά',          name_ru = 'Стройматериалы',      name_fa = 'مواد ساختمانی'      WHERE slug = 'insaat-malzemeleri';
UPDATE categories SET name_en = 'Hardware & Ironmongery', name_el = 'Σιδηρικά & Εργαλεία',      name_ru = 'Скобяные изделия',    name_fa = 'ابزار و یراق'       WHERE slug = 'hirdavat-nalburiye';
UPDATE categories SET name_en = 'Electrical & Lighting', name_el = 'Ηλεκτρολογικά & Φωτισμός',  name_ru = 'Электрика и освещение', name_fa = 'برق و روشنایی'     WHERE slug = 'elektrik-aydinlatma';
UPDATE categories SET name_en = 'Plumbing & Heating',    name_el = 'Υδραυλικά & Θέρμανση',      name_ru = 'Сантехника и отопление', name_fa = 'لوله‌کشی و گرمایش' WHERE slug = 'sihhi-tesisat-isitma';
UPDATE categories SET name_en = 'Paint & Insulation',    name_el = 'Χρώματα & Μόνωση',          name_ru = 'Краски и изоляция',   name_fa = 'رنگ و عایق'         WHERE slug = 'boya-yalitim';
UPDATE categories SET name_en = 'Machinery & Equipment', name_el = 'Μηχανήματα & Εξοπλισμός',   name_ru = 'Техника и оборудование', name_fa = 'ماشین‌آلات و تجهیزات' WHERE slug = 'is-makineleri-ekipman';
UPDATE categories SET name_en = 'Food & Beverage Wholesale', name_el = 'Τρόφιμα & Ποτά χονδρικής', name_ru = 'Продукты оптом',   name_fa = 'عمده غذا و نوشیدنی' WHERE slug = 'gida-icecek-toptan';
UPDATE categories SET name_en = 'Cleaning & Hygiene Wholesale', name_el = 'Καθαριστικά & Υγιεινή χονδρικής', name_ru = 'Гигиена оптом', name_fa = 'عمده بهداشت و نظافت' WHERE slug = 'temizlik-hijyen-toptan';
UPDATE categories SET name_en = 'Furniture & Decor Wholesale', name_el = 'Έπιπλα & Διακόσμηση χονδρικής', name_ru = 'Мебель и декор оптом', name_fa = 'عمده مبلمان و دکور' WHERE slug = 'mobilya-dekorasyon-toptan';
UPDATE categories SET name_en = 'Packaging & Logistics', name_el = 'Συσκευασία & Logistics',    name_ru = 'Упаковка и логистика', name_fa = 'بسته‌بندی و لجستیک' WHERE slug = 'ambalaj-lojistik';
