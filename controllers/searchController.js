const search = (req, res) => {
    const queryString = new URLSearchParams(req.query).toString();
    res.redirect(`/listings${queryString ? '?' + queryString : ''}`);
};

const suggestions = async (req, res) => {
    try {
        const query = req.query.q;
        if (!query || query.length < 2) {
            return res.json([]);
        }
        res.json([]);
    } catch (error) {
        console.error('Suggestions Error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

module.exports = {
    search,
    suggestions
};
