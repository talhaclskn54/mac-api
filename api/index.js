const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    // ===============================
    // CORS - APP / WEBVIEW UYUMLU
    // ===============================

    const origin = req.headers.origin;

    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Accept, X-Requested-With'
    );

    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Vary', 'Origin');

    // OPTIONS isteği
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    const TARGET_DOMAIN = 'https://taraftariumonline24.org';
    const HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': `${TARGET_DOMAIN}/`,
        'Origin': TARGET_DOMAIN,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
    };

    // M3U8 ve Video Adresi Ayıklayıcı
    function extractStreamUrl(htmlContent) {
        const streamPatterns = [
            /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i,
            /file:\s*["'](https?:\/\/[^\s"'<>]+\.m3u8[^"']*)["']/i,
            /source\s*:\s*["'](https?:\/\/[^\s"'<>]+\.m3u8[^"']*)["']/i,
            /src\s*:\s*["'](https?:\/\/[^\s"'<>]+\.m3u8[^"']*)["']/i
        ];
        for (let pattern of streamPatterns) {
            let match = htmlContent.match(pattern);
            if (match) {
                return match[1] || match[0];
            }
        }
        return null;
    }

    try {
        // A) M3U8 STREAM PROXY (CORS ve 403 Engellerini Aşan Mod)
        if (req.query.proxyUrl) {
            const streamUrl = decodeURIComponent(req.query.proxyUrl);
            const response = await axios({
                method: 'get',
                url: streamUrl,
                headers: {
                    'User-Agent': HEADERS['User-Agent'],
                    'Referer': TARGET_DOMAIN,
                    'Origin': TARGET_DOMAIN
                },
                responseType: 'arraybuffer'
            });
            res.setHeader('Content-Type', 'application/x-mpegURL');
            return res.status(200).send(response.data);
        }

        // B) TEK BİR MAÇIN M3U8/PLAYER LİNKİNİ ÇEKME
        if (req.query.getStream && req.query.url) {
            const pageUrl = req.query.url;
            const matchPage = await axios.get(pageUrl, { headers: HEADERS });
            const html = matchPage.data;

            // 1. Sayfa kaynağında direkt M3U8 ara
            let streamUrl = extractStreamUrl(html);
            if (streamUrl) {
                return res.status(200).json({
                    basarili: true,
                    streamUrl: streamUrl,
                    proxyStreamUrl: `/api?proxyUrl=${encodeURIComponent(streamUrl)}`,
                    type: 'm3u8'
                });
            }

            // 2. Sayfadaki Player Iframe'ini yakala
            const $page = cheerio.load(html);
            let iframeSrc = $page('iframe').attr('src') || $page('iframe[src*="player"]').attr('src');

            if (!iframeSrc) {
                const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
                if (iframeMatch) iframeSrc = iframeMatch[1];
            }

            if (iframeSrc) {
                if (iframeSrc.startsWith('//')) iframeSrc = 'https:' + iframeSrc;
                else if (iframeSrc.startsWith('/')) iframeSrc = TARGET_DOMAIN + iframeSrc;

                // Iframe içerisine girip M3U8 ara (Derin Tarama)
                try {
                    const iframePage = await axios.get(iframeSrc, {
                        headers: {
                            ...HEADERS,
                            'Referer': pageUrl
                        }
                    });
                    const iframeHtml = iframePage.data;
                    let innerStreamUrl = extractStreamUrl(iframeHtml);

                    if (innerStreamUrl) {
                        return res.status(200).json({
                            basarili: true,
                            streamUrl: innerStreamUrl,
                            proxyStreamUrl: `/api?proxyUrl=${encodeURIComponent(innerStreamUrl)}`,
                            type: 'm3u8'
                        });
                    }
                } catch (e) {
                    // Iframe gizlenmişse iframe adresini dön
                }

                return res.status(200).json({
                    basarili: true,
                    streamUrl: iframeSrc,
                    type: 'iframe'
                });
            }

            return res.status(200).json({ basarili: false, message: 'Yayın adresi bulunamadı.' });
        }

        // C) ANA MAÇ LİSTESİNİ ÇEKME (Takım İsimleri ve Saat Ayrıştırma)
        const { data } = await axios.get(TARGET_DOMAIN, { headers: HEADERS });
        const $ = cheerio.load(data);
        const maclar = [];

        // Hem /mac-izle/ hem de genel link yapılarını destekleyen geniş seçici
        $('a[href*="/mac-izle/"], a[href*="/mac/"]').each((i, element) => {
            const rawText = $(element).text().trim().replace(/\s+/g, ' ');
            const pageUrl = $(element).attr('href');

            if (rawText && pageUrl) {
                // Saat formatını yakala (örn: 20:00, 19:45)
                const timeMatch = rawText.match(/\b\d{2}:\d{2}\b/);
                const time = timeMatch ? timeMatch[0] : 'CANLI';

                // Saat bilgisini başlıktan çıkarıp temiz takım ismi elde etme
                let cleanTitle = rawText.replace(/\b\d{2}:\d{2}\b/, '').trim();
                cleanTitle = cleanTitle.replace(/^[-–\s]+|[-–\s]+$/g, '');

                // Takımları ayırma (örn: "Newcastle United - Liverpool")
                const teams = cleanTitle.split(/[-–vs]/i).map(t => t.trim());
                const homeTeam = teams[0] || cleanTitle;
                const awayTeam = teams[1] || '';

                const fullUrl = pageUrl.startsWith('http') ? pageUrl : `${TARGET_DOMAIN}${pageUrl.startsWith('/') ? '' : '/'}${pageUrl}`;

                // Aynı linkin mükerrer eklenmesini önleme
                if (!maclar.some(m => m.pageUrl === fullUrl)) {
                    maclar.push({
                        title: cleanTitle,
                        homeTeam: homeTeam,
                        awayTeam: awayTeam,
                        time: time,
                        pageUrl: fullUrl
                    });
                }
            }
        });

        res.status(200).json({
            basarili: true,
            toplam: maclar.length,
            maclar: maclar
        });

    } catch (error) {
        res.status(500).json({ basarili: false, hata: error.message });
    }
};
