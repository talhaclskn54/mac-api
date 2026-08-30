const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const TARGET_DOMAIN = 'https://taraftarium24bjk14.com';
    const HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': `${TARGET_DOMAIN}/`,
        'Origin': TARGET_DOMAIN
    };

    try {
        if (req.query.getStream && req.query.url) {
            let pageUrl = req.query.url;
            if (!pageUrl.startsWith('http')) {
                pageUrl = `${TARGET_DOMAIN}${pageUrl.startsWith('/') ? '' : '/'}${pageUrl}`;
            }

            const matchPage = await axios.get(pageUrl, { headers: HEADERS, timeout: 8000 });
            const html = matchPage.data;
            const $ = cheerio.load(html);

            let streamUrl = null;
            const m3u8Match = html.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
            if (m3u8Match) {
                streamUrl = m3u8Match[1];
            } else {
                let iframeSrc = $('iframe').attr('src');
                if (!iframeSrc) {
                    const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
                    if (iframeMatch) iframeSrc = iframeMatch[1];
                }
                if (iframeSrc) {
                    if (iframeSrc.startsWith('//')) iframeSrc = 'https:' + iframeSrc;
                    else if (iframeSrc.startsWith('/')) iframeSrc = TARGET_DOMAIN + iframeSrc;
                    streamUrl = iframeSrc;
                }
            }

            if (streamUrl) {
                return res.status(200).json({ basarili: true, streamUrl: streamUrl });
            } else {
                return res.status(200).json({ basarili: false, message: 'Yayın adresi çözülemedi.' });
            }
        }

        const { data } = await axios.get(TARGET_DOMAIN, { headers: HEADERS, timeout: 8000 });
        const $ = cheerio.load(data);
        const maclar = [];

        // Reklamları, site adlarını ve gereksiz menüleri elemek için yasaklı kelime filtresi
        const yasakliKelimeler = [
            'gizlilik', 'iletisim', 'anasayfa', 'reklam', 'bonus', 'casino', 
            'bahis', 'giris', 'twitter', 'telegram', 'app', 'indir', 'hakkimizda',
            'iletiket', 'kategori', 'cookie', 'copyright', 'taraftarium'
        ];

        $('a').each((i, element) => {
            const href = $(element).attr('href');
            const title = $(element).text().trim().replace(/\s+/g, ' ');

            if (href && title.length > 5) {
                const lowerTitle = title.toLowerCase();
                
                // Yasaklı kelimeleri içerenleri direkt atla
                const yasakliMi = yasakliKelimeler.some(kelime => lowerTitle.includes(kelime));
                if (yasakliMi) return;

                // İçinde takım vs belirten tire (-) veya vs ibaresi olan ya da saat içeren metinleri seç
                const hasTime = /\d{2}:\d{2}/.test(title);
                const hasVs = lowerTitle.includes(' - ') || lowerTitle.includes(' v ') || lowerTitle.includes('vs');

                if (hasTime || hasVs || lowerTitle.includes('spor') || lowerTitle.includes('bein')) {
                    const timeMatch = title.match(/\d{2}:\d{2}/);
                    const time = timeMatch ? timeMatch[0] : 'CANLI';

                    const fullUrl = href.startsWith('http') ? href : `${TARGET_DOMAIN}${href.startsWith('/') ? '' : '/'}${href}`;
                    
                    if (!maclar.some(m => m.pageUrl === fullUrl)) {
                        maclar.push({
                            title: title,
                            time: time,
                            pageUrl: fullUrl
                        });
                    }
                }
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
