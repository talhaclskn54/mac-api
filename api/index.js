const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    // CORS Ayarları
    const origin = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    const TARGET_DOMAIN = 'https://taraftariumonline24.org';
    const HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': `${TARGET_DOMAIN}/`,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    };

    function extractStreamUrl(htmlContent) {
        const streamPatterns = [
            /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i,
            /file:\s*["'](https?:\/\/[^\s"'<>]+\.m3u8[^"']*)["']/i,
            /src\s*:\s*["'](https?:\/\/[^\s"'<>]+\.m3u8[^"']*)["']/i
        ];
        for (let pattern of streamPatterns) {
            let match = htmlContent.match(pattern);
            if (match) return match[1] || match[0];
        }
        return null;
    }

    try {
        // A) M3U8 Proxy İsteği
        if (req.query.proxyUrl) {
            const streamUrl = decodeURIComponent(req.query.proxyUrl);
            const response = await axios.get(streamUrl, {
                headers: { 'User-Agent': HEADERS['User-Agent'], 'Referer': TARGET_DOMAIN },
                responseType: 'arraybuffer',
                timeout: 10000
            });
            res.setHeader('Content-Type', 'application/x-mpegURL');
            return res.status(200).send(response.data);
        }

        // B) Tek Maçın Yayın Linkini Çekme
        if (req.query.getStream && req.query.url) {
            const pageUrl = req.query.url;
            const matchPage = await axios.get(pageUrl, { headers: HEADERS, timeout: 8000 });
            const html = matchPage.data;

            let streamUrl = extractStreamUrl(html);
            if (streamUrl) {
                return res.status(200).json({
                    basarili: true,
                    streamUrl: streamUrl,
                    proxyStreamUrl: `/api?proxyUrl=${encodeURIComponent(streamUrl)}`,
                    type: 'm3u8'
                });
            }

            const $page = cheerio.load(html);
            let iframeSrc = $page('iframe').attr('src') || $page('iframe[src*="player"]').attr('src');

            if (iframeSrc) {
                if (iframeSrc.startsWith('//')) iframeSrc = 'https:' + iframeSrc;
                else if (iframeSrc.startsWith('/')) iframeSrc = TARGET_DOMAIN + iframeSrc;

                return res.status(200).json({
                    basarili: true,
                    streamUrl: iframeSrc,
                    type: 'iframe'
                });
            }

            return res.status(200).json({ basarili: false, message: 'Yayın adresi bulunamadı.' });
        }

        // C) Ana Maç Listesini Çekme
        const { data } = await axios.get(TARGET_DOMAIN, { headers: HEADERS, timeout: 10000 });
        const $ = cheerio.load(data);
        const maclar = [];

        $('a[href*="/mac/"], a[href*="/mac-izle/"], a[href*="izle"]').each((i, element) => {
            const rawText = $(element).text().trim().replace(/\s+/g, ' ');
            const pageUrl = $(element).attr('href');

            if (rawText && pageUrl && pageUrl !== '#' && !pageUrl.startsWith('javascript')) {
                const timeMatch = rawText.match(/\b\d{2}:\d{2}\b/);
                const time = timeMatch ? timeMatch[0] : 'CANLI';

                let cleanTitle = rawText.replace(/\b\d{2}:\d{2}\b/, '').trim();
                cleanTitle = cleanTitle.replace(/^[-–\s]+|[-–\s]+$/g, '');

                const fullUrl = pageUrl.startsWith('http') ? pageUrl : `${TARGET_DOMAIN}${pageUrl.startsWith('/') ? '' : '/'}${pageUrl}`;

                if (!maclar.some(m => m.pageUrl === fullUrl) && cleanTitle.length > 3) {
                    maclar.push({
                        title: cleanTitle,
                        time: time,
                        pageUrl: fullUrl
                    });
                }
            }
        });

        return res.status(200).json({
            basarili: true,
            toplam: maclar.length,
            maclar: maclar
        });

    } catch (error) {
        return res.status(500).json({ basarili: false, hata: error.message });
    }
};
