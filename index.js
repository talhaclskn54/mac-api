const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    // CORS Başlıkları
    res.setHeader('Access-Control-Allow-Credentials', true);
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

    const TARGET_DOMAIN = 'https://taraftariumonline24.org';
    const HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': `${TARGET_DOMAIN}/`,
        'Origin': TARGET_DOMAIN,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
    };

    try {
        // 1. YAYIN LİNKİNİ ÇÖZME İSTEĞİ
        if (req.query.getStream && req.query.url) {
            let pageUrl = req.query.url;
            if (!pageUrl.startsWith('http')) {
                pageUrl = `${TARGET_DOMAIN}${pageUrl.startsWith('/') ? '' : '/'}${pageUrl}`;
            }

            // Maç detay sayfasını çek
            const matchPage = await axios.get(pageUrl, { headers: HEADERS, timeout: 8000 });
            const html = matchPage.data;
            const $ = cheerio.load(html);

            let streamUrl = null;

            // M3U8 veya MP4 kalıplarını ara
            const m3u8Match = html.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
            if (m3u8Match) {
                streamUrl = m3u8Match[1];
            } else {
                // Iframe bulmaya çalış
                let iframeSrc = $('iframe').attr('src');
                if (!iframeSrc) {
                    const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
                    if (iframeMatch) iframeSrc = iframeMatch[1];
                }

                if (iframeSrc) {
                    if (iframeSrc.startsWith('//')) iframeSrc = 'https:' + iframeSrc;
                    else if (iframeSrc.startsWith('/')) iframeSrc = TARGET_DOMAIN + iframeSrc;

                    try {
                        const iframePage = await axios.get(iframeSrc, {
                            headers: { ...HEADERS, 'Referer': pageUrl },
                            timeout: 6000
                        });
                        const innerM3u8 = iframePage.data.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
                        if (innerM3u8) {
                            streamUrl = innerM3u8[1];
                        } else {
                            streamUrl = iframeSrc; // Doğrudan iframe linkini yedek olarak ver
                        }
                    } catch (err) {
                        streamUrl = iframeSrc;
                    }
                }
            }

            if (streamUrl) {
                return res.status(200).json({ basarili: true, streamUrl: streamUrl });
            } else {
                return res.status(200).json({ basarili: false, message: 'Yayın kaynağı bulunamadı.' });
            }
        }

        // 2. ANA MAÇ LİSTESİNİ ÇEKME
        const { data } = await axios.get(TARGET_DOMAIN, { headers: HEADERS, timeout: 8000 });
        const $ = cheerio.load(data);
        const maclar = [];

        $('a').each((i, element) => {
            const href = $(element).attr('href');
            const title = $(element).text().trim();

            if (href && (href.includes('mac-izle') || href.includes('match') || href.includes('kanallar') || element.attribs.class?.includes('match'))) {
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
