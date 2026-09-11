// Çerez onayı.
//
// Sitede zorunlu olmayan tek şey analitik: her sayfa görüntülemesi page_views
// tablosuna oturum kimliği ve IP özeti ile yazılıyor. Oturum çerezinin kendisi
// CSRF jetonunu ve giriş durumunu taşıdığı için zorunlu sayılır; sorun çerezin
// varlığı değil, o kimliğin ziyaretçiyi saymak için kullanılması. Onay da tam
// olarak bunu kapsıyor.
//
// Değer bilerek okunabilir bir metin: 'v1:all' / 'v1:essential'. Sürüm numarası,
// ileride yeni bir kategori eklenirse eski onayın sessizce yeni kategoriyi de
// kapsıyormuş gibi davranmasını engelliyor - sürüm değişince ziyaretçiye tekrar
// soruluyor.
const COOKIE_NAME = 'cyp_consent';
const VERSION = 'v1';

// Altı ay. Süresiz bir onay, "bir kez tıkladın, ömür boyu kabul" demek olurdu.
const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

const LEVELS = ['all', 'essential'];

// Kayit sirasinda kabul edilen metinlerin surumu. Kullanim kosullari ya da
// gizlilik politikasi esasli bicimde degistiginde bu tarih guncelleniyor;
// boylece eski onaylar yeni metni kapsamis gibi gorunmuyor ve kimin hangi
// metni kabul ettigi kayitta belli oluyor.
// 2026-09-11: gizlilik ve cerez politikalari yeniden yazildi, kullanim
// kosullarina yas maddesi eklendi.
const POLICY_VERSION = '2026-09-11';

// Kayit formunda ayrica onaylanan asgari yas. Bir ilan platformu, bir cocugun
// kendi telefon numarasini yayimlayabildigi yer.
const MINIMUM_AGE = 18;

const parse = (rawValue) => {
    // Karar verilmemiş: banner gösterilecek ve analitik çalışmayacak.
    const undecided = { decided: false, level: null, analytics: false };

    if (typeof rawValue !== 'string' || rawValue.length === 0) return undecided;

    const [version, level] = rawValue.split(':');

    // Eski sürümdeki ya da tanınmayan bir onay, onay sayılmıyor.
    if (version !== VERSION || !LEVELS.includes(level)) return undecided;

    return { decided: true, level, analytics: level === 'all' };
};

const serialize = (level) => (LEVELS.includes(level) ? `${VERSION}:${level}` : null);

const cookieOptions = {
    maxAge: MAX_AGE_MS,
    // Sunucu okuyor ama tarayıcıdaki betiğin de görmesi gerekmiyor.
    httpOnly: true,
    sameSite: 'lax',
    path: '/'
};

module.exports = {
    COOKIE_NAME, VERSION, LEVELS, MAX_AGE_MS, POLICY_VERSION, MINIMUM_AGE,
    parse, serialize, cookieOptions
};
