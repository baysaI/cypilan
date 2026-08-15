const Message = require('../models/Message');
const User = require('../models/User');
const Listing = require('../models/Listing');
const mailer = require('../config/mailer');

const MAX_LENGTH = 2000;

const inbox = async (req, res) => {
    try {
        const conversations = await Message.getInbox(req.session.userId);

        res.locals.meta.title = 'Mesajlarım | CYPILAN.COM';
        res.render('messages/inbox', {
            conversations,
            title: 'Mesajlarım'
        });
    } catch (error) {
        console.error('Inbox Error:', error);
        req.flash('error', 'flash.messages_load_failed');
        res.redirect('/');
    }
};

const conversation = async (req, res) => {
    try {
        const currentUserId = req.session.userId;
        const otherUserId = parseInt(req.params.userId, 10);
        const listingId = req.query.listing ? parseInt(req.query.listing, 10) : null;

        if (!Number.isInteger(otherUserId) || otherUserId === currentUserId) {
            req.flash('error', 'flash.invalid_conversation');
            return res.redirect('/messages');
        }

        const otherUser = await User.findById(otherUserId);
        if (!otherUser) {
            req.flash('error', 'flash.user_not_found');
            return res.redirect('/messages');
        }

        let listing = null;
        if (listingId != null && Number.isInteger(listingId)) {
            listing = await Listing.findById(listingId);
        }

        const messages = await Message.getConversation(
            currentUserId,
            otherUserId,
            listing ? listing.id : null
        );

        await Message.markAsRead(currentUserId, otherUserId, listing ? listing.id : null);

        res.locals.meta.title = `${otherUser.full_name} ile mesajlar | CYPILAN.COM`;
        res.render('messages/conversation', {
            messages,
            otherUser: { id: otherUser.id, full_name: otherUser.full_name, avatar_url: otherUser.avatar_url },
            listing,
            title: otherUser.full_name
        });
    } catch (error) {
        console.error('Conversation Error:', error);
        req.flash('error', 'flash.conversation_load_failed');
        res.redirect('/messages');
    }
};

const send = async (req, res) => {
    const backTo = (receiverId, listingId) =>
        `/messages/${receiverId}${listingId ? `?listing=${listingId}` : ''}`;

    try {
        const senderId = req.session.userId;
        const receiverId = parseInt(req.body.receiver_id, 10);
        const listingId = req.body.listing_id ? parseInt(req.body.listing_id, 10) : null;
        const content = (req.body.content || '').trim();

        if (!Number.isInteger(receiverId)) {
            req.flash('error', 'flash.recipient_not_found');
            return res.redirect('/messages');
        }

        if (receiverId === senderId) {
            req.flash('error', 'flash.cannot_message_self');
            return res.redirect('/messages');
        }

        if (!content) {
            req.flash('error', 'flash.message_empty');
            return res.redirect(backTo(receiverId, listingId));
        }

        if (content.length > MAX_LENGTH) {
            req.flash('error', 'flash.message_too_long', { max: MAX_LENGTH });
            return res.redirect(backTo(receiverId, listingId));
        }

        const receiver = await User.findById(receiverId);
        if (!receiver) {
            req.flash('error', 'flash.recipient_not_found');
            return res.redirect('/messages');
        }

        let validListingId = null;
        if (listingId != null && Number.isInteger(listingId)) {
            const listing = await Listing.findById(listingId);
            if (listing) validListingId = listing.id;
        }

        await Message.create({
            sender_id: senderId,
            receiver_id: receiverId,
            listing_id: validListingId,
            content
        });

        const senderName = req.session.userName || 'Bir kullanıcı';
        let listingTitle = 'İlanınız';
        if (validListingId) {
            const l = await Listing.findById(validListingId);
            if (l) listingTitle = l.title;
        }

        const conversationUrl = `${mailer.APP_URL}/messages/${senderId}${validListingId ? `?listing=${validListingId}` : ''}`;
        mailer.sendMessageNotificationEmail({
            to: receiver.email,
            senderName,
            listingTitle,
            conversationUrl
        }).catch(err => console.error('Message notification email error:', err));

        res.redirect(backTo(receiverId, validListingId));
    } catch (error) {
        console.error('Send Message Error:', error);
        req.flash('error', 'flash.message_send_failed');
        res.redirect('/messages');
    }
};

module.exports = {
    inbox,
    conversation,
    send
};
