const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const targetUrl = 'https://taraftarium2spor.top/';
        const { data } = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });

        const $ = cheerio.load(data);
        const maclar = [];

        $('a').each((i, el) => {
            const title = $(el).text().trim();
            const href = $(el).attr('href');

            if (href && title && title.length > 3) {
                const saatMatch = title.match(/(\d{2}:\d{2})/);
                const time = saatMatch ? saatMatch[1] : 'CANLI';
                const temizBaslik = title.replace(/\d{2}:\d{2}/, '').trim();

                maclar.push({
                    title: temizBaslik || title,
                    time: time,
                    streamUrl: href.startsWith('http') ? href : `https://taraftarium2spor.top${href}`
                });
            }
        });

        return res.status(200).json({
            basarili: true,
            toplam: maclar.length,
            maclar: maclar
        });
    } catch (error) {
        return res.status(500).json({
            basarili: false,
            hata: error.message
        });
    }
};
