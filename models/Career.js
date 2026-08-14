const { getDb } = require('../config/database');

const WORK_TYPES = ['full_time', 'part_time', 'contract', 'seasonal', 'internship'];
const SALARY_PERIODS = ['hourly', 'daily', 'monthly', 'yearly'];
const APPLICATION_STATUSES = ['pending', 'reviewed', 'shortlisted', 'rejected', 'withdrawn'];

// Free-text lists ("React, Node, SQL") are stored as typed and split on read, so
// the seeker is never forced through a tag widget to save a CV.
const splitList = (value) => String(value || '')
  .split(/[,;\n]/)
  .map((item) => item.trim())
  .filter(Boolean);

const normalise = (value) => String(value || '')
  .replace(/İ/g, 'i').replace(/I/g, 'ı')
  .toLowerCase()
  .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
  .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
  .trim();

class Career {
  // ---- Candidate profile (the CV) -----------------------------------------

  static async getProfile(userId) {
    const db = getDb();
    return db.prepare('SELECT * FROM candidate_profiles WHERE user_id = ?').get([userId]) || null;
  }

  static async saveProfile(userId, data) {
    const db = getDb();

    db.prepare(`
      INSERT INTO candidate_profiles (
        user_id, headline, summary, experience_years, education,
        skills, languages, certificates, preferred_city, preferred_work_type,
        is_open_to_work, is_public
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        headline = excluded.headline,
        summary = excluded.summary,
        experience_years = excluded.experience_years,
        education = excluded.education,
        skills = excluded.skills,
        languages = excluded.languages,
        certificates = excluded.certificates,
        preferred_city = excluded.preferred_city,
        preferred_work_type = excluded.preferred_work_type,
        is_open_to_work = excluded.is_open_to_work,
        is_public = excluded.is_public,
        updated_at = CURRENT_TIMESTAMP
    `).run([
      userId,
      data.headline || null,
      data.summary || null,
      Number.isFinite(Number(data.experience_years)) ? Math.max(0, Math.min(60, Number(data.experience_years))) : 0,
      data.education || null,
      data.skills || null,
      data.languages || null,
      data.certificates || null,
      data.preferred_city || null,
      WORK_TYPES.includes(data.preferred_work_type) ? data.preferred_work_type : null,
      data.is_open_to_work ? 1 : 0,
      data.is_public ? 1 : 0
    ]);

    return this.getProfile(userId);
  }

  // A CV is only useful to an employer once it says something. This is what the
  // "one-click apply" button checks before it offers itself.
  static isProfileReady(profile) {
    if (!profile) return false;
    return Boolean(
      (profile.headline && profile.headline.trim()) &&
      (profile.summary && profile.summary.trim().length >= 40)
    );
  }

  static profileCompleteness(profile) {
    if (!profile) return 0;
    const checks = [
      Boolean(profile.headline && profile.headline.trim()),
      Boolean(profile.summary && profile.summary.trim().length >= 40),
      Number(profile.experience_years) > 0,
      Boolean(profile.education && profile.education.trim()),
      splitList(profile.skills).length > 0,
      splitList(profile.languages).length > 0,
      Boolean(profile.preferred_city)
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }

  // ---- Job details ---------------------------------------------------------

  static async getJobDetails(listingId) {
    const db = getDb();
    return db.prepare('SELECT * FROM job_details WHERE listing_id = ?').get([listingId]) || null;
  }

  static async saveJobDetails(listingId, data) {
    const db = getDb();

    const min = Number.parseFloat(data.salary_min);
    const max = Number.parseFloat(data.salary_max);

    db.prepare(`
      INSERT INTO job_details (
        listing_id, work_type, salary_min, salary_max, salary_currency,
        salary_period, experience_required, benefits, required_skills, required_languages
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(listing_id) DO UPDATE SET
        work_type = excluded.work_type,
        salary_min = excluded.salary_min,
        salary_max = excluded.salary_max,
        salary_currency = excluded.salary_currency,
        salary_period = excluded.salary_period,
        experience_required = excluded.experience_required,
        benefits = excluded.benefits,
        required_skills = excluded.required_skills,
        required_languages = excluded.required_languages,
        updated_at = CURRENT_TIMESTAMP
    `).run([
      listingId,
      WORK_TYPES.includes(data.work_type) ? data.work_type : 'full_time',
      Number.isFinite(min) && min > 0 ? min : null,
      Number.isFinite(max) && max > 0 ? max : null,
      data.salary_currency === 'GBP' ? 'GBP' : 'TRY',
      SALARY_PERIODS.includes(data.salary_period) ? data.salary_period : 'monthly',
      Number.isFinite(Number(data.experience_required)) ? Math.max(0, Math.min(40, Number(data.experience_required))) : 0,
      data.benefits || null,
      data.required_skills || null,
      data.required_languages || null
    ]);

    return this.getJobDetails(listingId);
  }

  // ---- Applications --------------------------------------------------------

  static async findApplication(listingId, applicantId) {
    const db = getDb();
    return db.prepare('SELECT * FROM job_applications WHERE listing_id = ? AND applicant_id = ?')
      .get([listingId, applicantId]) || null;
  }

  // Re-applying edits the existing application rather than adding another, so an
  // employer's list holds one row per candidate.
  static async apply({ listing_id, applicant_id, cover_letter = null }) {
    const db = getDb();

    db.prepare(`
      INSERT INTO job_applications (listing_id, applicant_id, cover_letter, status)
      VALUES (?, ?, ?, 'pending')
      ON CONFLICT(listing_id, applicant_id) DO UPDATE SET
        cover_letter = excluded.cover_letter,
        status = 'pending',
        updated_at = CURRENT_TIMESTAMP
    `).run([listing_id, applicant_id, cover_letter]);

    return this.findApplication(listing_id, applicant_id);
  }

  static async withdraw(applicationId, applicantId) {
    const db = getDb();
    return db.prepare(`
      UPDATE job_applications SET status = 'withdrawn', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND applicant_id = ? AND status != 'withdrawn'
    `).run([applicationId, applicantId]).changes > 0;
  }

  // Only the employer who owns the advert may move an application along, which
  // is enforced in the statement rather than trusted from the caller.
  static async setStatus(applicationId, employerId, status) {
    if (!APPLICATION_STATUSES.includes(status) || status === 'withdrawn') return false;

    const db = getDb();
    return db.prepare(`
      UPDATE job_applications SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND listing_id IN (SELECT id FROM listings WHERE user_id = ?)
    `).run([status, applicationId, employerId]).changes > 0;
  }

  static async applicationsForApplicant(applicantId) {
    const db = getDb();
    return db.prepare(`
      SELECT a.*,
             l.title as listing_title, l.slug as listing_slug,
             l.location_city as listing_city, l.status as listing_status,
             u.full_name as employer_name, u.company_name as employer_company,
             j.work_type, j.salary_min, j.salary_max, j.salary_currency, j.salary_period
      FROM job_applications a
      JOIN listings l ON a.listing_id = l.id
      JOIN users u ON l.user_id = u.id
      LEFT JOIN job_details j ON j.listing_id = l.id
      WHERE a.applicant_id = ?
      ORDER BY a.created_at DESC
    `).all([applicantId]);
  }

  // The employer panel: every application across every advert they own, with
  // enough of the CV to triage without opening each one.
  static async applicationsForEmployer(employerId) {
    const db = getDb();
    return db.prepare(`
      SELECT a.*,
             l.title as listing_title, l.slug as listing_slug, l.status as listing_status,
             u.full_name as applicant_name, u.avatar_url as applicant_avatar,
             c.headline, c.summary, c.experience_years, c.skills, c.languages,
             c.education, c.preferred_city, c.is_public
      FROM job_applications a
      JOIN listings l ON a.listing_id = l.id
      JOIN users u ON a.applicant_id = u.id
      LEFT JOIN candidate_profiles c ON c.user_id = a.applicant_id
      WHERE l.user_id = ?
      ORDER BY
        CASE a.status
          WHEN 'shortlisted' THEN 0 WHEN 'pending' THEN 1
          WHEN 'reviewed' THEN 2 ELSE 3
        END,
        a.created_at DESC
    `).all([employerId]);
  }

  static async countPendingForEmployer(employerId) {
    const db = getDb();
    const { count } = db.prepare(`
      SELECT COUNT(*) as count FROM job_applications a
      JOIN listings l ON a.listing_id = l.id
      WHERE l.user_id = ? AND a.status = 'pending'
    `).get([employerId]);
    return count;
  }

  static async countForListing(listingId) {
    const db = getDb();
    const { count } = db.prepare(
      "SELECT COUNT(*) as count FROM job_applications WHERE listing_id = ? AND status != 'withdrawn'"
    ).get([listingId]);
    return count;
  }

  // ---- Openings and matching ----------------------------------------------

  // Every live advert under the jobs tree, with its pay attached.
  static async openings({ city, workType } = {}, page = 1, limit = 20) {
    const db = getDb();
    let where = " WHERE l.status = 'active' AND COALESCE(p.slug, c.slug) = 'is-ilanlari'";
    const params = [];

    if (city) {
      where += ' AND l.location_city = ?';
      params.push(city);
    }
    if (workType && WORK_TYPES.includes(workType)) {
      where += ' AND j.work_type = ?';
      params.push(workType);
    }

    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM listings l
      LEFT JOIN categories c ON l.category_id = c.id
      LEFT JOIN categories p ON c.parent_id = p.id
      LEFT JOIN job_details j ON j.listing_id = l.id
      ${where}
    `).get(params);

    const offset = (page - 1) * limit;
    const data = db.prepare(`
      SELECT l.*, c.name_tr as category_name,
             u.full_name as employer_name, u.company_name as employer_company,
             j.work_type, j.salary_min, j.salary_max, j.salary_currency, j.salary_period,
             j.experience_required, j.required_skills, j.required_languages, j.benefits,
             (SELECT COUNT(*) FROM job_applications
               WHERE listing_id = l.id AND status != 'withdrawn') as application_count
      FROM listings l
      LEFT JOIN categories c ON l.category_id = c.id
      LEFT JOIN categories p ON c.parent_id = p.id
      LEFT JOIN users u ON l.user_id = u.id
      LEFT JOIN job_details j ON j.listing_id = l.id
      ${where}
      ORDER BY l.is_premium DESC, l.created_at DESC
      LIMIT ? OFFSET ?
    `).all([...params, limit, offset]);

    return { data, total, pages: Math.ceil(total / limit) || 1 };
  }

  // Scores an advert against a CV. Deliberately explainable: the reasons are
  // returned alongside the number so the seeker is told *why* something was
  // suggested, instead of being handed an opaque ordering.
  static matchScore(opening, profile) {
    if (!profile) return { score: 0, reasons: [] };

    const reasons = [];
    let score = 0;

    const candidateSkills = splitList(profile.skills).map(normalise);
    const requiredSkills = splitList(opening.required_skills).map(normalise);
    if (requiredSkills.length > 0 && candidateSkills.length > 0) {
      const hits = requiredSkills.filter((skill) =>
        candidateSkills.some((own) => own.includes(skill) || skill.includes(own))
      );
      if (hits.length > 0) {
        score += Math.round((hits.length / requiredSkills.length) * 45);
        reasons.push({ type: 'skills', count: hits.length, total: requiredSkills.length });
      }
    }

    const candidateLanguages = splitList(profile.languages).map(normalise);
    const requiredLanguages = splitList(opening.required_languages).map(normalise);
    if (requiredLanguages.length > 0 && candidateLanguages.length > 0) {
      const hits = requiredLanguages.filter((language) =>
        candidateLanguages.some((own) => own.includes(language) || language.includes(own))
      );
      if (hits.length > 0) {
        score += Math.round((hits.length / requiredLanguages.length) * 20);
        reasons.push({ type: 'languages', count: hits.length, total: requiredLanguages.length });
      }
    }

    if (profile.preferred_city && opening.location_city === profile.preferred_city) {
      score += 20;
      reasons.push({ type: 'city', value: opening.location_city });
    }

    if (profile.preferred_work_type && opening.work_type === profile.preferred_work_type) {
      score += 10;
      reasons.push({ type: 'work_type', value: opening.work_type });
    }

    const required = Number(opening.experience_required) || 0;
    const held = Number(profile.experience_years) || 0;
    if (required > 0 && held >= required) {
      score += 15;
      reasons.push({ type: 'experience', required, held });
    } else if (required > 0 && held < required) {
      // Not a disqualification — an advert asking for five years still hires
      // someone with four — but it should not outrank a clean fit.
      score -= 10;
    }

    return { score: Math.max(0, score), reasons };
  }

  static rankOpenings(openings, profile) {
    return openings
      .map((opening) => {
        const { score, reasons } = this.matchScore(opening, profile);
        return { ...opening, matchScore: score, matchReasons: reasons };
      })
      .sort((a, b) => b.matchScore - a.matchScore);
  }
}

Career.WORK_TYPES = WORK_TYPES;
Career.SALARY_PERIODS = SALARY_PERIODS;
Career.APPLICATION_STATUSES = APPLICATION_STATUSES;
Career.splitList = splitList;

module.exports = Career;
