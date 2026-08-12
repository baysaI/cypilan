-- The admin account is created by config/database.js (ensureAdminUser) so its
-- password is never committed to the repository.

-- Main Categories
INSERT OR IGNORE INTO categories (id, parent_id, slug, name_tr, icon, sort_order) VALUES
(1, NULL, 'emlak', 'Emlak', 'home', 1),
(2, NULL, 'vasita', 'Vasıta', 'car', 2),
(3, NULL, 'is-ilanlari', 'İş İlanları', 'briefcase', 3),
(4, NULL, 'usta-hizmetler', 'Usta & Hizmetler', 'wrench', 4),
(5, NULL, 'ikinci-el', 'İkinci El', 'couch', 5);

-- Subcategories (Emlak)
INSERT OR IGNORE INTO categories (id, parent_id, slug, name_tr, sort_order) VALUES
(101, 1, 'satilik-daire', 'Satılık Daire', 1),
(102, 1, 'kiralik-daire', 'Kiralık Daire', 2),
(103, 1, 'satilik-villa', 'Satılık Villa', 3),
(104, 1, 'arsa', 'Arsa', 4);

-- Subcategories (Vasıta)
INSERT OR IGNORE INTO categories (id, parent_id, slug, name_tr, sort_order) VALUES
(201, 2, 'otomobil', 'Otomobil', 1),
(202, 2, 'motosiklet', 'Motosiklet', 2),
(203, 2, 'ticari-araclar', 'Ticari Araçlar', 3);

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

-- Category names in the other four languages.
-- Kept as UPDATEs because the INSERTs above are OR IGNORE: databases created
-- before these columns were filled would otherwise keep falling back to Turkish.
UPDATE categories SET name_en = 'Real Estate',           name_el = 'Ακίνητα',                   name_ru = 'Недвижимость',        name_fa = 'املاک'              WHERE slug = 'emlak';
UPDATE categories SET name_en = 'Vehicles',              name_el = 'Οχήματα',                   name_ru = 'Транспорт',           name_fa = 'وسایل نقلیه'        WHERE slug = 'vasita';
UPDATE categories SET name_en = 'Jobs',                  name_el = 'Θέσεις εργασίας',           name_ru = 'Работа',              name_fa = 'آگهی‌های شغلی'       WHERE slug = 'is-ilanlari';
UPDATE categories SET name_en = 'Trades & Services',     name_el = 'Τεχνίτες & Υπηρεσίες',      name_ru = 'Мастера и услуги',    name_fa = 'خدمات و پیشه‌وران'   WHERE slug = 'usta-hizmetler';
UPDATE categories SET name_en = 'Second Hand',           name_el = 'Μεταχειρισμένα',            name_ru = 'Б/у товары',          name_fa = 'کالای دست دوم'      WHERE slug = 'ikinci-el';

UPDATE categories SET name_en = 'Apartment for Sale',    name_el = 'Διαμέρισμα προς πώληση',    name_ru = 'Квартира на продажу', name_fa = 'آپارتمان فروشی'     WHERE slug = 'satilik-daire';
UPDATE categories SET name_en = 'Apartment for Rent',    name_el = 'Διαμέρισμα προς ενοικίαση', name_ru = 'Квартира в аренду',   name_fa = 'آپارتمان اجاره‌ای'   WHERE slug = 'kiralik-daire';
UPDATE categories SET name_en = 'Villa for Sale',        name_el = 'Βίλα προς πώληση',          name_ru = 'Вилла на продажу',    name_fa = 'ویلا فروشی'         WHERE slug = 'satilik-villa';
UPDATE categories SET name_en = 'Land',                  name_el = 'Οικόπεδο',                  name_ru = 'Земельный участок',   name_fa = 'زمین'               WHERE slug = 'arsa';

UPDATE categories SET name_en = 'Cars',                  name_el = 'Αυτοκίνητα',                name_ru = 'Автомобили',          name_fa = 'خودرو'              WHERE slug = 'otomobil';
UPDATE categories SET name_en = 'Motorcycles',           name_el = 'Μοτοσικλέτες',              name_ru = 'Мотоциклы',           name_fa = 'موتورسیکلت'         WHERE slug = 'motosiklet';
UPDATE categories SET name_en = 'Commercial Vehicles',   name_el = 'Επαγγελματικά οχήματα',     name_ru = 'Коммерческий транспорт', name_fa = 'خودروهای تجاری'  WHERE slug = 'ticari-araclar';

UPDATE categories SET name_en = 'Full Time',             name_el = 'Πλήρης απασχόληση',         name_ru = 'Полная занятость',    name_fa = 'تمام‌وقت'            WHERE slug = 'tam-zamanli';
UPDATE categories SET name_en = 'Part Time',             name_el = 'Μερική απασχόληση',         name_ru = 'Частичная занятость', name_fa = 'پاره‌وقت'            WHERE slug = 'yari-zamanli';

UPDATE categories SET name_en = 'Cleaning',              name_el = 'Καθαρισμός',                name_ru = 'Уборка',              name_fa = 'نظافت'              WHERE slug = 'temizlik';
UPDATE categories SET name_en = 'Renovation & Decoration', name_el = 'Ανακαίνιση & Διακόσμηση', name_ru = 'Ремонт и отделка',    name_fa = 'بازسازی و دکوراسیون' WHERE slug = 'tadilat-dekorasyon';
UPDATE categories SET name_en = 'Removals',              name_el = 'Μεταφορές',                 name_ru = 'Перевозки',           name_fa = 'حمل و نقل'          WHERE slug = 'nakliyat';

UPDATE categories SET name_en = 'Electronics',           name_el = 'Ηλεκτρονικά',               name_ru = 'Электроника',         name_fa = 'لوازم الکترونیکی'   WHERE slug = 'elektronik';
UPDATE categories SET name_en = 'Furniture',             name_el = 'Έπιπλα',                    name_ru = 'Мебель',              name_fa = 'مبلمان'             WHERE slug = 'mobilya';
UPDATE categories SET name_en = 'Clothing',              name_el = 'Ένδυση',                    name_ru = 'Одежда',              name_fa = 'پوشاک'              WHERE slug = 'giyim';
