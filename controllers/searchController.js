const Listing = require('../models/Listing');

const search = (req, res) => {
    const queryString = new URLSearchParams(req.query).toString();
    res.redirect(`/listings${queryString ? '?' + queryString : ''}`);
};

const suggestions = async (req, res) => {
    try {
        const query = req.query.q ? String(req.query.q).trim() : '';
        if (query.length < 2) {
            return res.json([]);
        }

        const results = await Listing.suggestTitles(query, 8);
        res.json(results.map(row => ({ title: row.title, url: `/listings/${row.slug}` })));
    } catch (error) {
        console.error('Suggestions Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

module.exports = {
    search,
    suggestions
};
