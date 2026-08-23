const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { data } = await axios.get('https://www.ecanlitvizle.live/canlitv', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });

        const $ = cheerio.load(data);
        const channels = [];

        $('a').each((i, el) => {
            const href = $(el).attr('href');
            const name = $(el).text().trim();
            const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src');

            if (href && href.includes('/canli/') && name) {
                channels.push({
                    id: i + 1,
                    name: name.replace(/\s+/g, ' '),
                    logo: img ? (img.startsWith('http') ? img : `https://www.ecanlitvizle.live${img}`) : '',
                    streamUrl: href.startsWith('http') ? href : `https://www.ecanlitvizle.live${href}`,
                    epg: 'Canlı Yayın'
                });
            }
        });

        return res.status(200).json({
            success: true,
            total: channels.length,
            data: channels
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
