const t = require('./helpers');

const Career = require(t.rootDir + '/models/Career');
const Listing = require(t.rootDir + '/models/Listing');

t.run('İş ilanları modülü', async (db) => {
  const employer = t.makeUser(db, 'emp@test.local', 'Otel A.Ş.', 'business');
  const seeker = t.makeUser(db, 'seek@test.local', 'Ayşe Aday');
  const other = t.makeUser(db, 'other@test.local', 'Başka Kişi');

  const job = await Listing.create({
    user_id: employer, category_id: 301, title: 'Resepsiyon Görevlisi',
    slug: 'resepsiyon-gorevlisi', description: 'Otelimize resepsiyonist aranıyor',
    status: 'active', city: 'Girne'
  });

  await Career.saveJobDetails(job.id, {
    work_type: 'full_time', salary_min: 40000, salary_max: 55000,
    salary_currency: 'TRY', salary_period: 'monthly', experience_required: 2,
    required_skills: 'Ön büro, müşteri ilişkileri, Excel',
    required_languages: 'İngilizce, Rusça', benefits: 'Yemek, servis'
  });

  const details = await Career.getJobDetails(job.id);
  t.assert(details && details.salary_min === 40000, 'İş ilanı detayları (maaş, nitelik, yan hak) kaydedildi');

  // --- Tek tik basvuru, CV hazir olana kadar kapali
  t.assert(!Career.isProfileReady(null), 'CV yokken tek tık başvuru kapalı');

  await Career.saveProfile(seeker, { headline: 'Resepsiyonist', summary: 'kısa' });
  t.assert(
    !Career.isProfileReady(await Career.getProfile(seeker)),
    'Tanıtım 40 karakterden kısaysa başvuru hâlâ kapalı'
  );

  await Career.saveProfile(seeker, {
    headline: 'Deneyimli Resepsiyonist',
    summary: 'Beş yıl otel ön büro deneyimim var, misafir ilişkilerinde güçlüyüm ve vardiyalı çalışabilirim.',
    experience_years: 5, education: 'Turizm Meslek Yüksekokulu',
    skills: 'Ön büro, müşteri ilişkileri, Excel, rezervasyon',
    languages: 'İngilizce, Rusça, Türkçe',
    preferred_city: 'Girne', preferred_work_type: 'full_time',
    is_open_to_work: 1, is_public: 1
  });

  const profile = await Career.getProfile(seeker);
  t.assert(Career.isProfileReady(profile), 'CV tamamlanınca tek tık başvuru açılıyor');
  t.assert(Career.profileCompleteness(profile) >= 90, 'CV doluluk oranı hesaplanıyor');

  // --- Eslesme ve gerekceleri
  const openings = await Career.openings({}, 1, 20);
  t.assertEqual(openings.total, 1, 'Açık pozisyon listeleniyor');

  const ranked = Career.rankOpenings(openings.data, profile);
  const match = ranked[0];
  t.assert(match.matchScore > 0, `Eşleşme puanı hesaplanıyor (${match.matchScore})`);

  const reasonTypes = match.matchReasons.map((reason) => reason.type);
  const allReasons = ['skills', 'languages', 'city', 'work_type', 'experience']
    .every((type) => reasonTypes.includes(type));
  t.assert(allReasons, 'Eşleşme gerekçeleri açıklanıyor (yetkinlik, dil, şehir, tip, deneyim)');

  // --- Zayif aday daha dusuk puan almali
  await Career.saveProfile(other, {
    headline: 'Yeni Mezun',
    summary: 'Turizm bölümünden yeni mezun oldum, öğrenmeye açığım ve hevesliyim.',
    experience_years: 0, skills: 'Excel', languages: 'İngilizce', preferred_city: 'Lefkoşa'
  });
  const weak = Career.matchScore(match, await Career.getProfile(other));
  t.assert(weak.score < match.matchScore, `Uygunluğu düşük aday daha düşük puan alıyor (${weak.score} < ${match.matchScore})`);

  // --- Basvuru
  await Career.apply({ listing_id: job.id, applicant_id: seeker, cover_letter: 'İlgileniyorum' });
  let applications = await Career.applicationsForEmployer(employer);
  t.assertEqual(applications.length, 1, 'Başvuru işverene ulaştı');
  t.assertEqual(applications[0].headline, 'Deneyimli Resepsiyonist', 'Aday CV bilgisi işveren panelinde görünüyor');

  await Career.apply({ listing_id: job.id, applicant_id: seeker, cover_letter: 'Güncellendi' });
  applications = await Career.applicationsForEmployer(employer);
  t.assertEqual(applications.length, 1, 'Tekrar başvuru yeni satır açmadı, mevcudu güncelledi');

  // --- Yetki
  const applicationId = applications[0].id;
  t.assertRejected(
    await Career.setStatus(applicationId, other, 'shortlisted'),
    'İlan sahibi olmayan başvuru durumunu değiştiremiyor'
  );
  t.assert(
    await Career.setStatus(applicationId, employer, 'shortlisted'),
    'İşveren adayı kısa listeye alabiliyor'
  );
  t.assertRejected(await Career.withdraw(applicationId, other), 'Başkası başvuruyu geri çekemiyor');
  t.assert(await Career.withdraw(applicationId, seeker), 'Aday kendi başvurusunu geri çekebiliyor');

  // --- Özel PDF & Fotoğraf Testi
  await Career.saveProfile(seeker, {
    headline: 'Deneyimli Resepsiyonist & Ön Büro Şefi',
    photo_url: '/uploads/cvs/photo-test.webp',
    custom_cv_url: '/uploads/cvs/cv-test.pdf',
    custom_cv_name: 'Ayse_Aday_CV.pdf',
    custom_cv_size: 1048576
  });

  const updatedProfile = await Career.getProfile(seeker);
  t.assertEqual(updatedProfile.custom_cv_url, '/uploads/cvs/cv-test.pdf', 'Özel CV PDF yolu kaydedildi');
  t.assertEqual(updatedProfile.custom_cv_name, 'Ayse_Aday_CV.pdf', 'Özel CV dosya adı kaydedildi');
  t.assertEqual(updatedProfile.photo_url, '/uploads/cvs/photo-test.webp', 'CV fotoğraf yolu kaydedildi');

  // --- CYPILAN Filigranlı PDF Oluşturma Testi
  const { generateCvPdf } = require(t.rootDir + '/utils/pdfGenerator');
  const User = require(t.rootDir + '/models/User');
  const seekerUser = await User.findById(seeker);
  const pdfBuffer = await generateCvPdf({ user: seekerUser, profile: updatedProfile });

  t.assert(Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 5000, 'CYPILAN filigranlı PDF başarıyla üretildi');
  t.assert(pdfBuffer.toString('utf8', 0, 4) === '%PDF', 'Üretilen dosya geçerli PDF başlığı (%PDF) içeriyor');

  // --- Özel CV ve Fotoğraf Kaldırma
  await Career.removePhoto(seeker);
  const noPhotoProfile = await Career.getProfile(seeker);
  t.assertEqual(noPhotoProfile.photo_url, null, 'CV fotoğrafı veritabanından kaldırıldı');

  await Career.removeCustomCv(seeker);
  const noCvProfile = await Career.getProfile(seeker);
  t.assertEqual(noCvProfile.custom_cv_url, null, 'Özel PDF veritabanından kaldırıldı');

  // --- CV Sıfırlama Testi
  await Career.deleteProfile(seeker);
  const resetProfile = await Career.getProfile(seeker);
  t.assertEqual(resetProfile, null, 'CV profili tamamen sıfırlandı');

  // --- Sablonlar
  const cvHtml = await t.render('career/profile.ejs', {
    profile: updatedProfile, candidateUser: seekerUser, completeness: Career.profileCompleteness(updatedProfile),
    workTypes: Career.WORK_TYPES, cityNames: t.cities.names(),
    title: 'test', user: { id: seeker, name: 'Ayşe Aday' }
  });
  t.assert(cvHtml.includes('CYPILAN PDF Çıktısı'), 'career/profile.ejs PDF indirme butonunu basıyor');
  t.assert(cvHtml.includes('/kariyer/cv/sifirla'), 'career/profile.ejs CV sıfırlama formunu basıyor');
  t.assert(cvHtml.includes('resetCvModal'), 'career/profile.ejs CV sıfırlama onay modalını içeriyor');

  const openHtml = await t.render('career/openings.ejs', {
    openings: ranked, pagination: { currentPage: 1, totalPages: 1, totalItems: 1 },
    filters: {}, profile, profileReady: true, appliedListingIds: [],
    workTypes: Career.WORK_TYPES, title: 'test', user: { id: seeker, name: 'Ayşe Aday' }
  });
  t.assert(openHtml.includes('Tek Tıkla Başvur'), 'career/openings.ejs başvuru butonunu basıyor');
  t.assert(openHtml.includes('Uygunluk'), 'Eşleşme rozeti gösteriliyor');

  const employerHtml = await t.render('career/employer.ejs', {
    groups: [{
      listingTitle: 'Resepsiyon Görevlisi', listingSlug: 'resepsiyon-gorevlisi',
      listingStatus: 'active', applications: [{
        ...applications[0],
        custom_cv_url: '/uploads/cvs/cv-test.pdf',
        custom_cv_name: 'Ayse_CV.pdf'
      }]
    }],
    statuses: Career.APPLICATION_STATUSES.filter((status) => status !== 'withdrawn'),
    title: 'test', user: { id: employer, name: 'Otel A.Ş.' }
  });
  t.assert(employerHtml.includes('İşveren Paneli'), 'career/employer.ejs render ediliyor');
  t.assert(employerHtml.includes('CYPILAN CV (PDF)'), 'career/employer.ejs CYPILAN CV PDF butonunu gösteriyor');
  t.assert(employerHtml.includes('Adayın PDF Dosyası'), 'career/employer.ejs Adayın Özel PDF butonunu gösteriyor');

  const mineHtml = await t.render('career/applications.ejs', {
    applications: await Career.applicationsForApplicant(seeker),
    completeness: 100, title: 'test', user: { id: seeker, name: 'Ayşe Aday' }
  });
  t.assert(mineHtml.includes('Resepsiyon Görevlisi'), 'career/applications.ejs render ediliyor');

  const allLangs = ['tr', 'en', 'el', 'ru', 'fa'].every((lang) =>
    ['career.one_click_apply', 'career.employer_panel', 'flash.cv_incomplete', 'career.download_cypilan_pdf']
      .every((key) => t.translate(key, lang) !== key)
  );
  t.assert(allLangs, 'career.* anahtarları 5 dilde çözülüyor');
});
