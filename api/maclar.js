const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    // CORS Başlıkları (Mobil Uygulama Erişimi İçin)
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
    
    // Cloudflare Aşımı İçin ScraperAPI Entegrasyonu (Ücretsiz Key: https://www.scraperapi.com)
    // Eğer ScraperAPI kullanmak istemiyorsan doğrudan TARGET_DOMAIN kullanabilirsin.
    const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || ''; 
    
    function getProxyUrl(targetUrl) {
        if (SCRAPER_API_KEY) {
            return `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(targetUrl)}&render=true`;
        }
        return targetUrl;
    }

    const HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': `${TARGET_DOMAIN}/`,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
    };

    // M3U8 VE STREAM LİNKİ AYIKLAMA REGEX
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
                return url.replace(/\\/g, ''); // Backslash temizleme
            }
        }
        return null;
    }

    try {
        // A) SADECE TEK BİR MAÇIN M3U8 YAYIN LİNKİNİ ÇEKME (?getStream=1&url=...)
        if (req.query.getStream && req.query.url) {
            const pageUrl = req.query.url;
            const requestUrl = getProxyUrl(pageUrl);

            const matchPage = await axios.get(requestUrl, { headers: HEADERS, timeout: 12000 });
            const html = matchPage.data;

            // 1. HTML / JS İçi M3U8 Arama
            let streamUrl = extractStreamUrl(html);
            if (streamUrl) {
                return res.status(200).json({ basarili: true, streamUrl: streamUrl, type: 'm3u8' });
            }

            // 2. Iframe ve Embed Arama
            const $page = cheerio.load(html);
            let iframeSrc = $page('iframe[src*="play"], iframe[src*="embed"], iframe[data-src], iframe').first().attr('src');

            if (!iframeSrc) {
                const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
                if (iframeMatch) iframeSrc = iframeMatch[1];
            }

            if (iframeSrc) {
                if (iframeSrc.startsWith('//')) iframeSrc = 'https:' + iframeSrc;
                else if (iframeSrc.startsWith('/')) iframeSrc = TARGET_DOMAIN + iframeSrc;

                // Iframe İçine Girip Derin M3U8 Taraması
                try {
                    const iframeReqUrl = getProxyUrl(iframeSrc);
                    const iframePage = await axios.get(iframeReqUrl, {
                        headers: { ...HEADERS, 'Referer': pageUrl },
                        timeout: 10000
                    });
                    
                    let innerStreamUrl = extractStreamUrl(iframePage.data);
                    if (innerStreamUrl) {
                        return res.status(200).json({ basarili: true, streamUrl: innerStreamUrl, type: 'm3u8' });
                    }
                } catch (e) {
                    // Iframe isteği başarısız olursa iframe adresi döndür
                }

                return res.status(200).json({ basarili: true, streamUrl: iframeSrc, type: 'iframe' });
            }

            return res.status(200).json({ basarili: false, message: 'Yayın adresi veya player bulunamadı.' });
        }

        // B) ANA SAYFADAN TÜM MAÇLARI VE KANALLARI ÇEKME
        const requestUrl = getProxyUrl(TARGET_DOMAIN);
        const response = await axios.get(requestUrl, { headers: HEADERS, timeout: 12000 });
        const html = response.data;

        // Cloudflare Engel Kontrolü
        if (html.includes('Just a moment...') || html.includes('cf-challenge')) {
            return res.status(403).json({
                basarili: false,
                hata: 'Cloudflare bot engeline takıldı. Lütfen ScraperAPI key ekleyin.'
            });
        }

        const $ = cheerio.load(html);
        const maclar = [];
        const kanallar = [];

        // Geniş Arama: Sayfadaki Tüm Link ve Kart Yapılarını Tara
        $('a').each((i, element) => {
            const $el = $(element);
            let href = $el.attr('href');
            let text = $el.text().trim().replace(/\s+/g, ' ');

            if (!href || href === '#' || href.startsWith('javascript:')) return;

            // URL Formatlama
            let fullUrl = href;
            if (href.startsWith('/')) fullUrl = `${TARGET_DOMAIN}${href}`;
            else if (!href.startsWith('http')) fullUrl = `${TARGET_DOMAIN}/${href}`;

            // Saat Bilgisi Yakalama (15:00, 20:45 gibi)
            const timeMatch = text.match(/\b\d{2}:\d{2}\b/);
            const time = timeMatch ? timeMatch[0] : 'CANLI';

            // Maç Linklerini Ayıklama
            const isMatch = href.includes('mac') || href.includes('izle') || href.includes('match') || /\d+/.test(href);
            if (isMatch && text.length > 3) {
                if (!maclar.some(m => m.pageUrl === fullUrl)) {
                    maclar.push({
                        title: text,
                        time: time,
                        pageUrl: fullUrl
                    });
                }
            }

            // Canlı Kanal Linklerini Ayıklama (BeIN, S Sport vb.)
            const isChannel = href.includes('kanal') || href.includes('tv') || href.includes('channel');
            if (isChannel && text.length > 2) {
                if (!kanallar.some(k => k.pageUrl === fullUrl)) {
                    kanallar.push({
                        title: text,
                        pageUrl: fullUrl
                    });
                }
            }
        });

        return res.status(200).json({
            basarili: true,
            toplamMac: maclar.length,
            toplamKanal: kanallar.length,
            maclar: maclar,
            kanallar: kanallar
        });

    } catch (error) {
        return res.status(500).json({
            basarili: false,
            hata: error.message
        });
    }
};
