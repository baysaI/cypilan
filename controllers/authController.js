const User = require('../models/User');

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
        
        if (!user || !(await User.verifyPassword(password, user.password_hash))) {
            req.flash('error', 'Geçersiz e-posta veya şifre.');
            return res.redirect('/auth/login');
        }

        if (user.is_active === 0) {
            req.flash('error', 'Hesabınız askıya alınmış veya henüz onaylanmamış.');
            return res.redirect('/auth/login');
        }

        // Set session
        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.session.userEmail = user.email;
        req.session.userName = user.full_name;

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
    res.locals.meta = res.locals.meta || {};
    res.locals.meta.title = 'Kayıt Ol | CYPILAN.COM';
    res.render('auth/register', { title: 'Kayıt Ol' });
};

const register = async (req, res) => {
    try {
        const { full_name, firstName, lastName, email, password, passwordConfirm, phone } = req.body;
        const name = full_name || `${firstName || ''} ${lastName || ''}`.trim();

        if (!name || !email || !password) {
            req.flash('error', 'Lütfen zorunlu alanları doldurun.');
            return res.redirect('/auth/register');
        }

        if (passwordConfirm && password !== passwordConfirm) {
            req.flash('error', 'Şifreler uyuşmuyor.');
            return res.redirect('/auth/register');
        }

        const existingUser = await User.findByEmail(email);
        if (existingUser) {
            req.flash('error', 'Bu e-posta adresi zaten kullanılıyor.');
            return res.redirect('/auth/register');
        }
        
        const userId = await User.create({
            email,
            password,
            full_name: name,
            phone: phone || ''
        });

        const newUser = await User.findById(userId);

        req.session.userId = newUser.id;
        req.session.userRole = newUser.role;
        req.session.userEmail = newUser.email;
        req.session.userName = newUser.full_name;

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
