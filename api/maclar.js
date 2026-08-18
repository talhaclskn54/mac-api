const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    // CORS Başlıkları
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

    const TARGET_DOMAIN = 'https://www.ardaspor30.top';
    const HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': `${TARGET_DOMAIN}/`,
        'Origin': TARGET_DOMAIN,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
    };

    // M3U8 VE STREAM LİNKİ AYIKLAMA (Çoklu regex desenleri)
    function extractStreamUrl(htmlContent) {
        if (!htmlContent) return null;

        const streamPatterns = [
            /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i,
            /file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
            /source\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
            /src\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
            /hls\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i,
            /["'](https?:\/\/[^"']+\/hls\/[^"']+)["']/i,
            /(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/i
        ];

        for (let pattern of streamPatterns) {
            let match = htmlContent.match(pattern);
            if (match) {
                let url = match[1] || match[0];
                return url.replace(/\\/g, ''); // Escape karakterlerini temizle
            }
        }
        return null;
    }

    try {
        // 1. DETAYLI YAYIN VE M3U8 LINKI ÇEKME (?getStream=1&url=...)
        if (req.query.getStream && req.query.url) {
            const pageUrl = req.query.url;
            
            const matchPage = await axios.get(pageUrl, { 
                headers: HEADERS,
                timeout: 8000 
            });
            const html = matchPage.data;

            // A) Direct m3u8 Arama
            let streamUrl = extractStreamUrl(html);
            if (streamUrl) {
                return res.status(200).json({ basarili: true, streamUrl, type: 'm3u8' });
            }

            // B) Iframe Arama & Derin Tarama
            const $page = cheerio.load(html);
            let iframeSrc = $page('iframe[src*="play"], iframe[src*="embed"], iframe[data-src]').attr('src') || $page('iframe').attr('src');

            if (!iframeSrc) {
                const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
                if (iframeMatch) iframeSrc = iframeMatch[1];
            }

            if (iframeSrc) {
                if (iframeSrc.startsWith('//')) iframeSrc = 'https:' + iframeSrc;
                else if (iframeSrc.startsWith('/')) iframeSrc = TARGET_DOMAIN + iframeSrc;

                try {
                    const iframePage = await axios.get(iframeSrc, {
                        headers: {
                            ...HEADERS,
                            'Referer': pageUrl
                        },
                        timeout: 8000
                    });
                    
                    let innerStreamUrl = extractStreamUrl(iframePage.data);
                    if (innerStreamUrl) {
                        return res.status(200).json({ basarili: true, streamUrl: innerStreamUrl, type: 'm3u8' });
                    }
                } catch (e) {
                    // Iframe isteği başarısız olursa webview/player fallback ver
                }

                return res.status(200).json({ basarili: true, streamUrl: iframeSrc, type: 'iframe' });
            }

            return res.status(200).json({ basarili: false, message: 'Yayın adresi veya player bulunamadı.' });
        }

        // 2. MAÇ VE CANLI KANAL LİSTESİNİ ÇEKME
        const { data } = await axios.get(TARGET_DOMAIN, { headers: HEADERS, timeout: 8000 });
        const $ = cheerio.load(data);
        const maclar = [];
        const kanallar = [];

        // Maç Linklerini Yakalama (Alternatif CSS Selector'ları)
        $('a[href*="/mac-izle/"], a[href*="/izle/"], .match-item a, .event-list a').each((i, element) => {
            const $el = $(element);
            let title = $el.text().trim() || $el.attr('title') || '';
            let pageUrl = $el.attr('href');

            if (pageUrl && title) {
                // Saat ayıklama
                const timeMatch = title.match(/\b\d{2}:\d{2}\b/);
                const time = timeMatch ? timeMatch[0] : 'CANLI';

                // URL tamamlama
                if (pageUrl.startsWith('/')) pageUrl = `${TARGET_DOMAIN}${pageUrl}`;
                else if (!pageUrl.startsWith('http')) pageUrl = `${TARGET_DOMAIN}/${pageUrl}`;

                // Mükerrer kayıt engelleme
                if (!maclar.some(m => m.pageUrl === pageUrl)) {
                    maclar.push({
                        title: title.replace(/\s+/g, ' ').trim(),
                        time: time,
                        pageUrl: pageUrl
                    });
                }
            }
        });

        // Canlı TV / Kanal Linklerini Yakalama
        $('a[href*="/kanal/"], a[href*="/canli-tv/"], .channel-list a').each((i, element) => {
            const $el = $(element);
            let title = $el.text().trim() || $el.attr('title') || '';
            let pageUrl = $el.attr('href');

            if (pageUrl && title) {
                if (pageUrl.startsWith('/')) pageUrl = `${TARGET_DOMAIN}${pageUrl}`;
                else if (!pageUrl.startsWith('http')) pageUrl = `${TARGET_DOMAIN}/${pageUrl}`;

                if (!kanallar.some(k => k.pageUrl === pageUrl)) {
                    kanallar.push({
                        title: title.replace(/\s+/g, ' ').trim(),
                        pageUrl: pageUrl
                    });
                }
            }
        });

        res.status(200).json({
            basarili: true,
            toplamMac: maclar.length,
            toplamKanal: kanallar.length,
            maclar: maclar,
            kanallar: kanallar
        });

    } catch (error) {
        res.status(500).json({
            basarili: false,
            hata: error.message
        });
    }
};
