const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { isValidEmail, isValidPassword, isValidPhone } = require('../utils/validators');

const BCRYPT_ROUNDS = 10;

// Re-issues the session id on privilege change so a pre-login session id captured
// by an attacker cannot be reused as an authenticated one (session fixation).
const startAuthenticatedSession = (req, user, redirectTo, successMessage, res) => {
    req.session.regenerate((regenerateErr) => {
        if (regenerateErr) {
            console.error('Session Regenerate Error:', regenerateErr);
            req.flash('error', 'Oturum başlatılamadı. Lütfen tekrar deneyin.');
            return res.redirect('/auth/login');
        }

        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.session.userEmail = user.email;
        req.session.userName = user.full_name;

        req.session.save((saveErr) => {
            if (saveErr) console.error('Session Save Error:', saveErr);
            req.flash('success', successMessage);
            res.redirect(redirectTo);
        });
    });
};

const showLogin = (req, res) => {
    if (req.session && req.session.userId) {
        return res.redirect('/');
    }
    res.locals.meta.title = 'Giriş Yap';
    res.render('auth/login', { title: 'Giriş Yap' });
};

const login = async (req, res) => {
    try {
        const { password, remember } = req.body;
        const email = String(req.body.email || '').trim().toLowerCase();

        if (!email || !password) {
            req.flash('error', 'Lütfen tüm alanları doldurun.');
            return res.redirect('/auth/login');
        }

        const user = await User.findByEmail(email);

        if (!user || !user.password_hash) {
            req.flash('error', 'Geçersiz e-posta veya şifre.');
            return res.redirect('/auth/login');
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            req.flash('error', 'Geçersiz e-posta veya şifre.');
            return res.redirect('/auth/login');
        }

        if (Number(user.is_active) === 0) {
            req.flash('error', 'Hesabınız askıya alınmış veya henüz onaylanmamış.');
            return res.redirect('/auth/login');
        }

        // Read before regenerating — the old session is discarded.
        const returnTo = req.session.returnTo || '/';
        const rememberMe = Boolean(remember);

        req.session.regenerate((regenerateErr) => {
            if (regenerateErr) {
                console.error('Session Regenerate Error:', regenerateErr);
                req.flash('error', 'Oturum başlatılamadı. Lütfen tekrar deneyin.');
                return res.redirect('/auth/login');
            }

            req.session.userId = user.id;
            req.session.userRole = user.role;
            req.session.userEmail = user.email;
            req.session.userName = user.full_name;

            if (rememberMe) {
                req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
            }

            req.session.save((saveErr) => {
                if (saveErr) console.error('Session Save Error:', saveErr);
                req.flash('success', 'Başarıyla giriş yaptınız.');
                res.redirect(returnTo);
            });
        });
    } catch (error) {
        console.error('Login Error:', error);
        req.flash('error', 'Giriş işlemi sırasında bir hata oluştu.');
        res.redirect('/auth/login');
    }
};

const showRegister = (req, res) => {
    if (req.session && req.session.userId) {
        return res.redirect('/');
    }
    res.locals.meta.title = 'Kayıt Ol';
    res.render('auth/register', { title: 'Kayıt Ol' });
};

const register = async (req, res) => {
    try {
        const { password, passwordConfirm, accountType } = req.body;
        const email = String(req.body.email || '').trim().toLowerCase();
        const fullName = String(req.body.fullName || '').trim();
        const phone = String(req.body.phone || '').trim();

        if (!email || !password || !fullName) {
            req.flash('error', 'Lütfen gerekli alanları doldurun.');
            return res.redirect('/auth/register');
        }

        if (!isValidEmail(email)) {
            req.flash('error', 'Geçerli bir e-posta adresi girin.');
            return res.redirect('/auth/register');
        }

        if (fullName.length < 2) {
            req.flash('error', 'Ad Soyad en az 2 karakter olmalıdır.');
            return res.redirect('/auth/register');
        }

        if (!isValidPassword(password)) {
            req.flash('error', 'Şifre en az 8 karakter olmalı, 1 büyük harf ve 1 rakam içermelidir.');
            return res.redirect('/auth/register');
        }

        if (password !== passwordConfirm) {
            req.flash('error', 'Şifreler birbiriyle uyuşmuyor.');
            return res.redirect('/auth/register');
        }

        if (phone && !isValidPhone(phone)) {
            req.flash('error', 'Geçerli bir telefon numarası girin.');
            return res.redirect('/auth/register');
        }

        const existingUser = await User.findByEmail(email);
        if (existingUser) {
            req.flash('error', 'Bu e-posta adresi zaten kullanımda.');
            return res.redirect('/auth/register');
        }

        const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const userId = await User.create({
            email,
            password_hash,
            full_name: fullName,
            phone: phone || null,
            role: 'user',
            company_name: accountType === 'corporate' ? fullName : null
        });

        const user = await User.findById(userId);

        startAuthenticatedSession(
            req,
            user,
            '/',
            'Hesabınız başarıyla oluşturuldu ve giriş yapıldı.',
            res
        );
    } catch (error) {
        console.error('Register Error:', error);
        req.flash('error', 'Kayıt sırasında bir hata oluştu.');
        res.redirect('/auth/register');
    }
};

const logout = (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('Logout Error:', err);
        res.clearCookie('cypilan.sid');
        res.redirect('/');
    });
};

module.exports = {
    showLogin,
    login,
    showRegister,
    register,
    logout
};
