const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { data } = await axios.get('https://www.ecanlitvizle.live/canlitv', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
            },
            timeout: 10000
        });

        const $ = cheerio.load(data);
        const channels = [];

        // Genişletilmiş seçici: Site içi tüm kanal kartlarını ve linklerini yakalar
        $('a[href*="/canli-"], a[href*="/canli/"], .channel-item, .tv-item, .col-').each((i, el) => {
            const $el = $(el);
            let href = $el.attr('href') || $el.find('a').attr('href');
            let name = $el.find('.name, .title, h3, h4, span').text().trim() || $el.attr('title') || $el.text().trim();
            let img = $el.find('img').attr('src') || $el.find('img').attr('data-src') || $el.find('img').attr('data-lazy-src');

            // Gereksiz metin temizliği
            if (name) {
                name = name.replace(/\s+/g, ' ').replace(/izle|canlı/gi, '').trim();
            }

            if (href && name && href.length > 3) {
                // Link formatını düzenle
                const fullUrl = href.startsWith('http') ? href : `https://www.ecanlitvizle.live${href.startsWith('/') ? '' : '/'}${href}`;
                
                // Logo formatını düzenle
                let fullLogo = '';
                if (img) {
                    fullLogo = img.startsWith('http') ? img : `https://www.ecanlitvizle.live${img.startsWith('/') ? '' : '/'}${img}`;
                }

                // Çift kayıtları engelle
                const exists = channels.some(c => c.streamUrl === fullUrl);
                if (!exists && name.length > 1) {
                    channels.push({
                        id: channels.length + 1,
                        name: name,
                        logo: fullLogo,
                        streamUrl: fullUrl,
                        epg: 'Canlı Yayın'
                    });
                }
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
