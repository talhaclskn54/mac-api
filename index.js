const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    // Tüm CORS engellerini kaldıran genişletilmiş başlıklar
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const TARGET_DOMAIN = 'https://taraftarium24bjk14.com';
    const HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': `${TARGET_DOMAIN}/`,
        'Origin': TARGET_DOMAIN,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
    };

    try {
        // 1. İSTEK: Maç detay veya yayın linkini çözme
        if (req.query.getStream && req.query.url) {
            let pageUrl = req.query.url;
            if (!pageUrl.startsWith('http')) {
                pageUrl = `${TARGET_DOMAIN}${pageUrl.startsWith('/') ? '' : '/'}${pageUrl}`;
            }

            const matchPage = await axios.get(pageUrl, { headers: HEADERS, timeout: 8000 });
            const html = matchPage.data;
            const $ = cheerio.load(html);

            let streamUrl = null;

            // Sayfa içerisinden .m3u8 uzantılı doğrudan yayın akışını arar
            const m3u8Match = html.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
            if (m3u8Match) {
                streamUrl = m3u8Match[1];
            } else {
                // Bulamazsa sayfadaki ilk iframe kaynağını alır
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

        // 2. İSTEK: Ana sayfadaki maç listesini çekme
        const { data } = await axios.get(TARGET_DOMAIN, { headers: HEADERS, timeout: 8000 });
        const $ = cheerio.load(data);
        const maclar = [];

        // Sitedeki maç bağlantılarını ve başlıklarını tarar
        $('a').each((i, element) => {
            const href = $(element).attr('href');
            const title = $(element).text().trim();

            if (href && (href.includes('mac') || href.includes('match') || href.includes('kanallar') || title.length > 5)) {
                const timeMatch = title.match(/\d{2}:\d{2}/);
                const time = timeMatch ? timeMatch[0] : 'CANLI';

                if (title.length > 2) {
                    const fullUrl = href.startsWith('http') ? href : `${TARGET_DOMAIN}${href.startsWith('/') ? '' : '/'}${href}`;
                    
                    if (!maclar.some(m => m.pageUrl === fullUrl)) {
                        maclar.push({
                            title: title.replace(/\s+/g, ' '),
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
