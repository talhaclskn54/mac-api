const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
    // ===============================
    // CORS AYARLARI
    // ===============================
    const origin = req.headers.origin;
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    // ===============================
    // A) ANA DİZİN: HTML ARAYÜZÜ SUNMA
    // ===============================
    const isApiCall = req.query.proxyUrl || req.query.getStream || req.query.api === '1' || req.headers.accept?.includes('application/json');

    if (!isApiCall) {
        try {
            const htmlPath = path.join(process.cwd(), 'index.html');
            if (fs.existsSync(htmlPath)) {
                const htmlContent = fs.readFileSync(htmlPath, 'utf8');
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.status(200).send(htmlContent);
            }
        } catch (e) {
            // HTML okuma hatası olursa API moduna düşer
        }
    }

    const TARGET_DOMAIN = 'https://taraftariumonline24.org';
    const HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.google.com/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    };

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
        // ===============================
        // B) M3U8 STREAM PROXY
        // ===============================
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

        // ===============================
        // C) TEK BİR MAÇIN LİNKİNİ ÇEKME
        // ===============================
        if (req.query.getStream && req.query.url) {
            const pageUrl = req.query.url;
            const matchPage = await axios.get(pageUrl, { headers: HEADERS, timeout: 8000 });
            const html = matchPage.data;

            let streamUrl = extractStreamUrl(html);
            if (streamUrl) {
                return res.status(200).json({
                    basarili: true,
                    streamUrl: streamUrl,
                    proxyStreamUrl: `/?proxyUrl=${encodeURIComponent(streamUrl)}`,
                    type: 'm3u8'
                });
            }

            const $page = cheerio.load(html);
            let iframeSrc = $page('iframe').attr('src') || $page('iframe[src*="player"]').attr('src');

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
                        timeout: 8000
                    });
                    let innerStreamUrl = extractStreamUrl(iframePage.data);

                    if (innerStreamUrl) {
                        return res.status(200).json({
                            basarili: true,
                            streamUrl: innerStreamUrl,
                            proxyStreamUrl: `/?proxyUrl=${encodeURIComponent(innerStreamUrl)}`,
                            type: 'm3u8'
                        });
                    }
                } catch (e) {}

                return res.status(200).json({
                    basarili: true,
                    streamUrl: iframeSrc,
                    type: 'iframe'
                });
            }

            return res.status(200).json({ basarili: false, message: 'Yayın adresi bulunamadı.' });
        }

        // ===============================
        // D) ANA MAÇ LİSTESİNİ ÇEKME
        // ===============================
        const { data } = await axios.get(TARGET_DOMAIN, { headers: HEADERS, timeout: 10000 });
        const $ = cheerio.load(data);
        const maclar = [];

        // Genişletilmiş Bağlantı ve İframe Seçicileri
        $('a[href*="/mac/"], a[href*="/mac-izle/"], a[href*="izle"], .match-item, .mac-listesi a').each((i, element) => {
            const rawText = $(element).text().trim().replace(/\s+/g, ' ');
            const pageUrl = $(element).attr('href');

            if (rawText && pageUrl && pageUrl !== '#' && !pageUrl.startsWith('javascript')) {
                const timeMatch = rawText.match(/\b\d{2}:\d{2}\b/);
                const time = timeMatch ? timeMatch[0] : 'CANLI';

                let cleanTitle = rawText.replace(/\b\d{2}:\d{2}\b/, '').trim();
                cleanTitle = cleanTitle.replace(/^[-–\s]+|[-–\s]+$/g, '');

                const teams = cleanTitle.split(/[-–vs]/i).map(t => t.trim());
                const homeTeam = teams[0] || cleanTitle;
                const awayTeam = teams[1] || '';

                const fullUrl = pageUrl.startsWith('http') ? pageUrl : `${TARGET_DOMAIN}${pageUrl.startsWith('/') ? '' : '/'}${pageUrl}`;

                if (!maclar.some(m => m.pageUrl === fullUrl) && cleanTitle.length > 3) {
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
        res.status(500).json({ 
            basarili: false, 
            hata: error.message,
            detay: "Hedef siteye erişilemedi veya Cloudflare engeline takıldı." 
        });
    }
};
