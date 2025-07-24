// server.js
const express = require('express');
const axios = require('axios');
const app = express();
const PORT = 4000;

app.get('/campground', async (req, res) => {
    const { facilityId, month } = req.query;
    const url = `https://www.recreation.gov/api/camps/availability/campground/${facilityId}/month?start_date=${month}-01T00%3A00%3A00.000Z`;

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json',
                'Referer': 'https://www.recreation.gov/',
                'Origin': 'https://www.recreation.gov'
            }
        });
        res.json(response.data);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to fetch from recreation.gov' });
    }
});

app.listen(PORT, () => {
    console.log(`Proxy running on http://localhost:${PORT}`);
});