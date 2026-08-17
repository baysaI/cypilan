const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const mailer = require('../config/mailer');
const { isValidEmail, isValidPassword, isValidPhone } = require('../utils/validators');

const BCRYPT_ROUNDS = 10;

// Re-issues the session id on privilege change so a pre-login session id captured
// by an attacker cannot be reused as an authenticated one (session fixation).
const startAuthenticatedSession = (req, user, redirectTo, successMessage, res) => {
    req.session.regenerate((regenerateErr) => {
        if (regenerateErr) {
            console.error('Session Regenerate Error:', regenerateErr);
            req.flash('error', 'flash.session_start_failed');
            return res.redirect('/auth/login');
        }

        req.session.userId = user.id;
        req.session.userRole = user.role;
        req.session.userEmail = user.email;
        req.session.userName = user.full_name;
        req.session.userIsVerified = Boolean(user.is_verified);

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
            req.flash('error', 'flash.fill_all_fields');
            return res.redirect('/auth/login');
        }

        const user = await User.findByEmail(email);

        if (!user || !user.password_hash) {
            req.flash('error', 'flash.invalid_credentials');
            return res.redirect('/auth/login');
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            req.flash('error', 'flash.invalid_credentials');
            return res.redirect('/auth/login');
        }

        if (Number(user.is_active) === 0) {
            req.flash('error', 'flash.account_suspended');
            return res.redirect('/auth/login');
        }

        const Setting = require('../models/Setting');
        if (Setting.getBool(Setting.KEYS.MAINTENANCE_ENABLED, false) && user.role !== 'admin') {
            req.flash('error', 'flash.maintenance_no_user_login');
            return res.redirect('/auth/login');
        }

        // Read before regenerating — the old session is discarded.
        const returnTo = req.session.returnTo || '/';
        const rememberMe = Boolean(remember);

        await User.touchLastSeen(user.id);

        req.session.regenerate((regenerateErr) => {
            if (regenerateErr) {
                console.error('Session Regenerate Error:', regenerateErr);
                req.flash('error', 'flash.session_start_failed');
                return res.redirect('/auth/login');
            }

            req.session.userId = user.id;
            req.session.userRole = user.role;
            req.session.userEmail = user.email;
            req.session.userName = user.full_name;
            req.session.lastSeenTouchedAt = Date.now();

            if (rememberMe) {
                req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
            }

            req.session.save((saveErr) => {
                if (saveErr) console.error('Session Save Error:', saveErr);
                req.flash('success', 'flash.login_success');
                res.redirect(returnTo);
            });
        });
    } catch (error) {
        console.error('Login Error:', error);
        req.flash('error', 'flash.login_failed');
        res.redirect('/auth/login');
    }
};

const showRegister = (req, res) => {
    if (req.session && req.session.userId) {
        return res.redirect('/');
    }
    const formData = req.session.registerFormData || {};
    delete req.session.registerFormData;

    res.locals.meta.title = 'Kayıt Ol';
    res.render('auth/register', { title: 'Kayıt Ol', formData });
};

const register = async (req, res) => {
    const saveFormAndRedirect = (errorKey) => {
        req.session.registerFormData = {
            email: String(req.body.email || '').trim(),
            fullName: String(req.body.fullName || '').trim(),
            phone: String(req.body.phone || '').trim(),
            accountType: req.body.accountType || 'individual'
        };
        req.flash('error', errorKey);
        return res.redirect('/auth/register');
    };

    try {
        const { password, passwordConfirm, accountType } = req.body;
        const email = String(req.body.email || '').trim().toLowerCase();
        const fullName = String(req.body.fullName || '').trim();
        const phone = String(req.body.phone || '').trim();

        if (!email || !password || !fullName) {
            return saveFormAndRedirect('flash.fill_required_fields');
        }

        if (!isValidEmail(email)) {
            return saveFormAndRedirect('flash.invalid_email');
        }

        if (fullName.length < 2) {
            return saveFormAndRedirect('flash.name_too_short');
        }

        if (!isValidPassword(password)) {
            return saveFormAndRedirect('flash.weak_password');
        }

        if (password !== passwordConfirm) {
            return saveFormAndRedirect('flash.passwords_do_not_match');
        }

        if (phone && !isValidPhone(phone)) {
            return saveFormAndRedirect('flash.invalid_phone');
        }

        const existingUser = await User.findByEmail(email);
        if (existingUser) {
            return saveFormAndRedirect('flash.email_taken');
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

        // Generate email verification token (valid for 24h)
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await User.setVerificationToken(userId, verificationToken, expiresAt);

        const verificationUrl = `${mailer.baseUrlFor(req)}/auth/verify-email/${verificationToken}`;
        mailer.sendEmailVerificationEmail({
            to: user.email,
            name: user.full_name,
            verificationUrl
        }).catch(err => console.error('Verification email error:', err));

        // Send welcome email asynchronously
        mailer.sendWelcomeEmail({ to: user.email, name: user.full_name, baseUrl: mailer.baseUrlFor(req) }).catch(err => console.error('Welcome email error:', err));

        startAuthenticatedSession(
            req,
            user,
            '/',
            'flash.register_success_verify_notice',
            res
        );
    } catch (error) {
        console.error('Register Error:', error);
        req.flash('error', 'flash.register_failed');
        res.redirect('/auth/register');
    }
};

const showForgotPassword = (req, res) => {
    if (req.session && req.session.userId) {
        return res.redirect('/');
    }
    res.locals.meta.title = 'Şifremi Unuttum';
    res.render('auth/forgot-password', { title: 'Şifremi Unuttum' });
};

const forgotPassword = async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        if (!email || !isValidEmail(email)) {
            req.flash('error', 'flash.invalid_email');
            return res.redirect('/auth/forgot-password');
        }

        const user = await User.findByEmail(email);
        if (user && Number(user.is_active) !== 0) {
            const token = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

            await User.setResetToken(user.id, token, expiresAt);

            const resetUrl = `${mailer.baseUrlFor(req)}/auth/reset-password?token=${token}`;
            await mailer.sendPasswordResetEmail({
                to: user.email,
                name: user.full_name,
                resetUrl
            });
        }

        req.flash('success', 'flash.reset_email_sent');
        res.redirect('/auth/forgot-password');
    } catch (error) {
        console.error('Forgot Password Error:', error);
        req.flash('error', 'flash.reset_email_failed');
        res.redirect('/auth/forgot-password');
    }
};

const showResetPassword = async (req, res) => {
    const token = String(req.query.token || '').trim();
    if (!token) {
        req.flash('error', 'flash.invalid_reset_token');
        return res.redirect('/auth/login');
    }

    const user = await User.findByResetToken(token);
    if (!user) {
        req.flash('error', 'flash.invalid_or_expired_reset_token');
        return res.redirect('/auth/forgot-password');
    }

    res.locals.meta.title = 'Yeni Şifre Belirle';
    res.render('auth/reset-password', { title: 'Yeni Şifre Belirle', token });
};

const resetPassword = async (req, res) => {
    try {
        const { token, password, passwordConfirm } = req.body;
        if (!token) {
            req.flash('error', 'flash.invalid_reset_token');
            return res.redirect('/auth/login');
        }

        const user = await User.findByResetToken(token);
        if (!user) {
            req.flash('error', 'flash.invalid_or_expired_reset_token');
            return res.redirect('/auth/forgot-password');
        }

        if (!isValidPassword(password)) {
            req.flash('error', 'flash.weak_password');
            return res.redirect(`/auth/reset-password?token=${encodeURIComponent(token)}`);
        }

        if (password !== passwordConfirm) {
            req.flash('error', 'flash.passwords_do_not_match');
            return res.redirect(`/auth/reset-password?token=${encodeURIComponent(token)}`);
        }

        await User.setPassword(user.id, password);

        req.flash('success', 'flash.password_reset_success');
        res.redirect('/auth/login');
    } catch (error) {
        console.error('Reset Password Error:', error);
        req.flash('error', 'flash.password_reset_failed');
        res.redirect('/auth/login');
    }
};

const verifyEmail = async (req, res) => {
    try {
        const { token } = req.params;
        const user = await User.findByVerificationToken(token);

        if (!user) {
            req.flash('error', 'flash.invalid_verification_token');
            return res.redirect('/');
        }

        await User.verifyEmail(user.id);

        if (req.session && req.session.userId === user.id) {
            req.session.userIsVerified = true;
        }

        req.flash('success', 'flash.email_verified_success');
        res.redirect('/profile');
    } catch (error) {
        console.error('Verify Email Error:', error);
        req.flash('error', 'flash.action_failed');
        res.redirect('/');
    }
};

const showVerifyEmailPending = async (req, res) => {
    try {
        if (!req.session || !req.session.userId) {
            req.flash('error', 'flash.login_required');
            return res.redirect('/auth/login');
        }

        const user = await User.findById(req.session.userId);
        if (!user) {
            req.flash('error', 'flash.user_not_found');
            return res.redirect('/auth/login');
        }

        if (user.is_verified) {
            req.session.userIsVerified = true;
            req.flash('success', 'flash.email_verified_success');
            return res.redirect('/profile');
        }

        res.locals.meta.title = 'E-posta Doğrulama';
        res.render('auth/verify-email-pending', {
            title: 'E-posta Doğrulama',
            email: user.email
        });
    } catch (error) {
        console.error('Verify Email Pending Page Error:', error);
        res.redirect('/profile');
    }
};

const resendVerification = async (req, res) => {
    try {
        if (!req.session || !req.session.userId) {
            req.flash('error', 'flash.login_required');
            return res.redirect('/auth/login');
        }

        const user = await User.findById(req.session.userId);
        if (!user) {
            req.flash('error', 'flash.user_not_found');
            return res.redirect('/auth/login');
        }

        if (user.is_verified) {
            req.session.userIsVerified = true;
            req.flash('info', 'flash.email_already_verified');
            return res.redirect('/profile');
        }

        const verificationToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await User.setVerificationToken(user.id, verificationToken, expiresAt);

        const verificationUrl = `${mailer.baseUrlFor(req)}/auth/verify-email/${verificationToken}`;
        const sent = await mailer.sendEmailVerificationEmail({
            to: user.email,
            name: user.full_name,
            verificationUrl
        });

        console.log(`\n================ [EMAIL VERIFICATION LINK] ================`);
        console.log(`User:  ${user.email} (${user.full_name})`);
        console.log(`Link:  ${verificationUrl}`);
        console.log(`===========================================================\n`);

        if (sent) {
            req.flash('success', 'flash.verification_email_sent');
        } else {
            req.flash('info', 'flash.verification_email_sent');
        }

        res.redirect('/auth/verify-email-pending');
    } catch (error) {
        console.error('Resend Verification Error:', error);
        req.flash('error', 'flash.action_failed');
        res.redirect('/auth/verify-email-pending');
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
    showForgotPassword,
    forgotPassword,
    showResetPassword,
    resetPassword,
    verifyEmail,
    showVerifyEmailPending,
    resendVerification,
    logout
};
