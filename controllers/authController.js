const crypto = require('crypto');
// const User = require('../models/User'); // Mocking User model

// Mock user model methods
const User = {
    findByEmail: async (email) => null,
    create: async (data) => ({ id: 1, ...data }),
    verifyPassword: async (password, hash) => false,
    hashPassword: async (password) => password // naive mock
};

const showLogin = (req, res) => {
    if (req.session.userId) {
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
        
        if (!user || !(await User.verifyPassword(password, user.password))) {
            req.flash('error', 'Geçersiz e-posta veya şifre.');
            return res.redirect('/auth/login');
        }

        if (user.status !== 'active') {
            req.flash('error', 'Hesabınız askıya alınmış veya henüz onaylanmamış.');
            return res.redirect('/auth/login');
        }

        // Set session
        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.session.userEmail = user.email;
        req.session.userName = `${user.firstName} ${user.lastName}`;

        if (remember) {
            req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
        }

        const returnTo = req.session.returnTo || '/';
        delete req.session.returnTo;
        
        req.flash('success', 'Başarıyla giriş yaptınız.');
        res.redirect(returnTo);
    } catch (error) {
        console.error('Login Error:', error);
        req.flash('error', 'Giriş işlemi sırasında bir hata oluştu.');
        res.redirect('/auth/login');
    }
};

const showRegister = (req, res) => {
    if (req.session.userId) {
        return res.redirect('/');
    }
    res.locals.meta.title = 'Kayıt Ol | CYPILAN.COM';
    res.render('auth/register', { title: 'Kayıt Ol' });
};

const register = async (req, res) => {
    try {
        const { firstName, lastName, email, password, passwordConfirm, phone } = req.body;

        if (!firstName || !lastName || !email || !password || !phone) {
            req.flash('error', 'Lütfen zorunlu alanları doldurun.');
            return res.redirect('/auth/register');
        }

        if (password !== passwordConfirm) {
            req.flash('error', 'Şifreler uyuşmuyor.');
            return res.redirect('/auth/register');
        }

        const existingUser = await User.findByEmail(email);
        if (existingUser) {
            req.flash('error', 'Bu e-posta adresi zaten kullanılıyor.');
            return res.redirect('/auth/register');
        }

        const hashedPassword = await User.hashPassword(password);
        
        const newUser = await User.create({
            firstName,
            lastName,
            email,
            password: hashedPassword,
            phone,
            role: 'user',
            status: 'active',
            createdAt: new Date().toISOString()
        });

        req.session.userId = newUser.id;
        req.session.userRole = newUser.role;
        req.session.userEmail = newUser.email;
        req.session.userName = `${newUser.firstName} ${newUser.lastName}`;

        req.flash('success', 'Hesabınız başarıyla oluşturuldu. Hoş geldiniz!');
        res.redirect('/');
    } catch (error) {
        console.error('Register Error:', error);
        req.flash('error', 'Kayıt işlemi sırasında bir hata oluştu.');
        res.redirect('/auth/register');
    }
};

const logout = (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout Error:', err);
        }
        res.clearCookie('connect.sid'); // Assuming default session cookie name
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
