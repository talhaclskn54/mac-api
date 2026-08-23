// api/channels.js
const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    // CORS başlıkları (Mobil uygulamanın veya frontend'in erişebilmesi için)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const targetUrl = 'https://www.ecanlitvizle.live/canlitv';
        const { data } = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win32; x86) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(data);
        const channels = [];

        // Site DOM yapısına göre kanal kartlarını tara
        $('.channel-item, .tv-list-item').each((i, el) => {
            const name = $(el).find('.channel-name, h3').text().trim();
            const logo = $(el).find('img').attr('src') || $(el).find('img').attr('data-src');
            const streamUrl = $(el).find('a').attr('href');
            const epg = $(el).find('.epg-info, .current-program').text().trim() || "Yayın akışı bilgisi yok";

            if (name && streamUrl) {
                channels.push({
                    id: i + 1,
                    name: name,
                    logo: logo ? (logo.startsWith('http') ? logo : `https://www.ecanlitvizle.live${logo}`) : '',
                    streamUrl: streamUrl.startsWith('http') ? streamUrl : `https://www.ecanlitvizle.live${streamUrl}`,
                    epg: epg
                });
            }
        });

        res.status(200).json({
            success: true,
            total: channels.length,
            data: channels
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
