const axios = require('axios');
const cheerio = require('cheerio');

// Siteden veri çekilemezse devreye girecek yedek liste (Uygulamanın boş kalmaması için)
const FALLBACK_CHANNELS = [
    { id: 1, name: "TRT 1", logo: "https://upload.wikimedia.org/wikipedia/commons/8/82/TRT_1_logo_2021.svg", streamUrl: "https://www.ecanlitvizle.live/trt-1-izle-1", epg: "Canlı Yayın" },
    { id: 2, name: "ATV", logo: "https://upload.wikimedia.org/wikipedia/commons/a/a3/Atv_logo_2021.png", streamUrl: "https://www.ecanlitvizle.live/atv-canli-izle-1", epg: "Canlı Yayın" },
    { id: 3, name: "Kanal D", logo: "https://upload.wikimedia.org/wikipedia/commons/0/05/Kanal_D_logo.svg", streamUrl: "https://www.ecanlitvizle.live/kanal-d-canli", epg: "Canlı Yayın" },
    { id: 4, name: "NOW TV", logo: "https://upload.wikimedia.org/wikipedia/commons/b/b3/NOW_TV_logo.svg", streamUrl: "https://www.ecanlitvizle.live/fox-tv-canli-izle", epg: "Canlı Yayın" },
    { id: 5, name: "TV8", logo: "https://upload.wikimedia.org/wikipedia/commons/3/30/Tv8_logo.png", streamUrl: "https://www.ecanlitvizle.live/tv8-canli-1", epg: "Canlı Yayın" },
    { id: 6, name: "Show TV", logo: "https://upload.wikimedia.org/wikipedia/commons/b/b5/Show_TV_logo.png", streamUrl: "https://www.ecanlitvizle.live/show-tv-izle-1", epg: "Canlı Yayın" },
    { id: 7, name: "Star TV", logo: "https://upload.wikimedia.org/wikipedia/commons/5/52/Star_TV_logo.svg", streamUrl: "https://www.ecanlitvizle.live/star-tv-canli-izle-1", epg: "Canlı Yayın" }
];

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
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8',
                'Referer': 'https://www.google.com/'
            },
            timeout: 8000
        });

        const $ = cheerio.load(data);
        const channels = [];

        // Ana sayfadaki tüm linkleri tara
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            let name = $(el).attr('title') || $(el).find('.title, span, strong').text().trim() || $(el).text().trim();
            let img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src');

            if (href && (href.includes('/canli') || href.includes('-izle')) && name) {
                name = name.replace(/canlı|izle|tv|hd/gi, '').trim();
                const fullUrl = href.startsWith('http') ? href : `https://www.ecanlitvizle.live${href.startsWith('/') ? '' : '/'}${href}`;
                
                let fullLogo = '';
                if (img) {
                    fullLogo = img.startsWith('http') ? img : `https://www.ecanlitvizle.live${img.startsWith('/') ? '' : '/'}${img}`;
                }

                if (name.length > 1 && !channels.some(c => c.streamUrl === fullUrl)) {
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

        // Eğer kazıma engellendiyse ve kanal bulunamadıysa yedek listeyi dön
        const finalData = channels.length > 0 ? channels : FALLBACK_CHANNELS;

        return res.status(200).json({
            success: true,
            source: channels.length > 0 ? "live_scrape" : "fallback",
            total: finalData.length,
            data: finalData
        });

    } catch (error) {
        // Hata durumunda da sistemin çökmemesi için yedek kanalları gönder
        return res.status(200).json({
            success: true,
            source: "fallback_error_recovery",
            total: FALLBACK_CHANNELS.length,
            data: FALLBACK_CHANNELS
        });
    }
};
