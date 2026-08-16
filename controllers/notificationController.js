const Notification = require('../models/Notification');

const PAGE_SIZE = 20;

const wantsJson = (req) => {
    const accept = req.headers.accept || '';
    return req.xhr || accept.includes('application/json') || req.path.startsWith('/api/');
};

const index = async (req, res, next) => {
    try {
        const userId = req.session.userId;
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const filter = req.query.filter === 'unread' ? 'unread' : 'all';
        const unreadOnly = filter === 'unread';

        const offset = (page - 1) * PAGE_SIZE;

        const [notifications, totalItems, unreadCount] = await Promise.all([
            Notification.getByUserId(userId, { limit: PAGE_SIZE, offset, unreadOnly }),
            Notification.countForUser(userId, { unreadOnly }),
            Notification.getUnreadCount(userId)
        ]);

        const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;

        res.locals.meta = res.locals.meta || {};
        res.locals.meta.title = res.locals.t('notifications.title') || 'Bildirimler';

        res.render('notifications/index', {
            notifications,
            filter,
            unreadCount,
            pagination: {
                page,
                totalItems,
                totalPages
            },
            title: res.locals.t('notifications.title') || 'Bildirimler'
        });
    } catch (error) {
        console.error('Notification Index Error:', error);
        next(error);
    }
};

const readAndRedirect = async (req, res, next) => {
    try {
        const userId = req.session.userId;
        const id = parseInt(req.params.id, 10);

        if (!Number.isInteger(id)) {
            if (wantsJson(req)) return res.status(400).json({ error: 'Invalid notification ID' });
            return res.redirect('/notifications');
        }

        const notification = await Notification.findById(id, userId);
        if (!notification) {
            if (wantsJson(req)) return res.status(404).json({ error: 'Notification not found' });
            return res.redirect('/notifications');
        }

        if (!notification.is_read) {
            await Notification.markAsRead(id, userId);
        }

        if (wantsJson(req)) {
            return res.json({ success: true, link_url: notification.link_url });
        }

        if (notification.link_url) {
            return res.redirect(notification.link_url);
        }

        res.redirect('/notifications');
    } catch (error) {
        console.error('Notification Read Error:', error);
        if (wantsJson(req)) return res.status(500).json({ error: 'Failed to mark as read' });
        res.redirect('/notifications');
    }
};

const markAllRead = async (req, res, next) => {
    try {
        const userId = req.session.userId;
        await Notification.markAllAsRead(userId);

        if (wantsJson(req)) {
            return res.json({ success: true });
        }

        req.flash('success', 'flash.notifications_marked_read');
        res.redirect(req.get('referer') || '/notifications');
    } catch (error) {
        console.error('Notification Mark All Read Error:', error);
        if (wantsJson(req)) return res.status(500).json({ error: 'Failed to mark all as read' });
        req.flash('error', 'flash.action_failed');
        res.redirect('/notifications');
    }
};

const deleteNotification = async (req, res, next) => {
    try {
        const userId = req.session.userId;
        const id = parseInt(req.params.id, 10);

        if (Number.isInteger(id)) {
            await Notification.delete(id, userId);
        }

        if (wantsJson(req)) {
            return res.json({ success: true });
        }

        req.flash('success', 'flash.notification_deleted');
        res.redirect(req.get('referer') || '/notifications');
    } catch (error) {
        console.error('Notification Delete Error:', error);
        if (wantsJson(req)) return res.status(500).json({ error: 'Failed to delete' });
        req.flash('error', 'flash.action_failed');
        res.redirect('/notifications');
    }
};

const getRecentApi = async (req, res, next) => {
    try {
        const userId = req.session.userId;
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const [notifications, unreadCount] = await Promise.all([
            Notification.getRecent(userId, 5),
            Notification.getUnreadCount(userId)
        ]);

        res.json({
            success: true,
            unreadCount,
            notifications
        });
    } catch (error) {
        console.error('Get Recent Notifications API Error:', error);
        res.status(500).json({ error: 'Failed to load notifications' });
    }
};

module.exports = {
    index,
    readAndRedirect,
    markAllRead,
    deleteNotification,
    getRecentApi
};
