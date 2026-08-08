const bcrypt = require('bcryptjs');
const User = require('../models/User');

const showLogin = (req, res) => {
    if (req.session && req.session.userId) {
        return res.redirect('/');
    }
    res.locals.meta.title = 'Giriş Yap | CYPILAN.COM';
    res.render('auth/login', { title: 'Giriş Yap' });
};

const login = async (req, res) => {
    try {
        const { email, password, remember } = req.body;
        
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

        if (user.is_active === 0) {
            req.flash('error', 'Hesabınız askıya alınmış veya henüz onaylanmamış.');
            return res.redirect('/auth/login');
        }

        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.session.userEmail = user.email;
        req.session.userName = user.full_name;

        if (remember) {
            req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
        }

        const returnTo = req.session.returnTo || '/';
        delete req.session.returnTo;

        req.session.save((err) => {
            if (err) console.error('Session Save Error:', err);
            req.flash('success', 'Başarıyla giriş yaptınız.');
            res.redirect(returnTo);
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
    res.locals.meta.title = 'Kayıt Ol | CYPILAN.COM';
    res.render('auth/register', { title: 'Kayıt Ol' });
};

const register = async (req, res) => {
    try {
        const { email, password, passwordConfirm, fullName, phone, accountType, terms } = req.body;

        if (!email || !password || !fullName) {
            req.flash('error', 'Lütfen gerekli alanları doldurun.');
            return res.redirect('/auth/register');
        }

        if (password !== passwordConfirm) {
            req.flash('error', 'Şifreler birbiriyle uyuşmuyor.');
            return res.redirect('/auth/register');
        }

        const existingUser = await User.findByEmail(email);
        if (existingUser) {
            req.flash('error', 'Bu e-posta adresi zaten kullanımda.');
            return res.redirect('/auth/register');
        }

        const password_hash = await bcrypt.hash(password, 10);
        const userId = await User.create({
            email,
            password_hash,
            full_name: fullName,
            phone: phone || '',
            role: 'user',
            company_name: accountType === 'corporate' ? fullName : null
        });

        const user = await User.findById(userId);

        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.session.userEmail = user.email;
        req.session.userName = user.full_name;

        req.session.save((err) => {
            if (err) console.error('Session Save Error:', err);
            req.flash('success', 'Hesabınız başarıyla oluşturuldu ve giriş yapıldı.');
            res.redirect('/');
        });
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
