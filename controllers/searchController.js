// Mock models
const Listing = {
    search: async (q, filters) => ({ data: [], total: 0 }),
    autocomplete: async (q) => []
};

const search = async (req, res) => {
    try {
        const query = req.query.q || '';
        const filters = {
            category: req.query.category,
            city: req.query.city,
            minPrice: req.query.minPrice,
            maxPrice: req.query.maxPrice,
            type: req.query.type,
            page: parseInt(req.query.page) || 1,
            limit: 20
        };

        const result = await Listing.search(query, filters);

        res.locals.meta.title = `"${query}" Arama Sonuçları | CYPILAN.COM`;
        
        res.render('search/index', {
            query,
            results: result.data,
            pagination: {
                page: filters.page,
                totalItems: result.total,
                totalPages: Math.ceil(result.total / filters.limit)
            },
            filters,
            title: 'Arama Sonuçları'
        });
    } catch (error) {
        console.error('Search Error:', error);
        req.flash('error', 'Arama sırasında bir hata oluştu.');
        res.redirect('back');
    }
};

const suggestions = async (req, res) => {
    try {
        const query = req.query.q;
        if (!query || query.length < 2) {
            return res.json([]);
        }

        const results = await Listing.autocomplete(query);
        res.json(results);
    } catch (error) {
        console.error('Suggestions Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

module.exports = {
    search,
    suggestions
};
