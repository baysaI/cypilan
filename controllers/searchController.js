const Listing = require('../models/Listing');
const smartSearch = require('../utils/smartSearch');

// A plain query string keeps working exactly as before; the parser only adds
// filters the visitor did not set by hand, so an explicit choice in the sidebar
// always wins over one inferred from the sentence.
const search = (req, res) => {
    const query = req.query.q ? String(req.query.q).trim() : '';

    if (!query) {
        const queryString = new URLSearchParams(req.query).toString();
        return res.redirect(`/listings${queryString ? '?' + queryString : ''}`);
    }

    const parsed = smartSearch.parse(query);
    const params = new URLSearchParams(req.query);

    if (parsed.filters.city && !params.get('city')) params.set('city', parsed.filters.city);
    if (parsed.filters.category && !params.get('category')) params.set('category', parsed.filters.category);
    if (parsed.filters.minPrice && !params.get('minPrice')) params.set('minPrice', String(parsed.filters.minPrice));
    if (parsed.filters.maxPrice && !params.get('maxPrice')) params.set('maxPrice', String(parsed.filters.maxPrice));

    // The original sentence is kept so the results page can show what was
    // understood and offer a way back to an unfiltered search.
    params.set('smart', '1');
    params.set('sort', params.get('sort') || 'relevance');

    res.redirect(`/listings?${params.toString()}`);
};

const suggestions = async (req, res) => {
    try {
        const query = req.query.q ? String(req.query.q).trim() : '';
        if (query.length < 2) {
            return res.json([]);
        }

        const parsed = smartSearch.parse(query);
        const results = await Listing.suggestTitles(parsed.leftover || query, 8);

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
