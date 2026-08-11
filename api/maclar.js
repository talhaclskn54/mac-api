const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    // CORS Başlıkları (Mobil uygulamadan ve dışarıdan erişim izni)
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

    const TARGET_DOMAIN = 'https://taraftarium2spor.top';
    const HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': `${TARGET_DOMAIN}/`,
        'Origin': TARGET_DOMAIN,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
    };

    // YAYIN LİNKİ AYIKLAMA FONKSİYONU (Yedekli Pattern Matching)
    function extractStreamUrl(htmlContent) {
        const streamPatterns = [
            /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i,                  // Standart M3U8 linki
            /file:\s*["'](https?:\/\/[^\s"'<>]+\.m3u8[^"']*)["']/i,       // Player içindeki file: "..." kalıbı
            /source\s*:\s*["'](https?:\/\/[^\s"'<>]+\.m3u8[^"']*)["']/i,     // Player içindeki source: "..." kalıbı
            /(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/i                    // MP4 yedek format
        ];

        for (let pattern of streamPatterns) {
            let match = htmlContent.match(pattern);
            if (match) {
                // Öncelik yakalanan grupta (match[1]), yoksa eşleşmenin tamamında (match[0])
                return match[1] || match[0];
            }
        }
        return null;
    }

    try {
        // 1. OYNATICI VEYA M3U8 LINKI AYIKLAMA (İzle butonuna basıldığında çalışır)
        if (req.query.getStream && req.query.url) {
            const pageUrl = req.query.url;
            
            // Maçın detay sayfasını çekiyoruz
            const matchPage = await axios.get(pageUrl, { headers: HEADERS });
            const html = matchPage.data;

            // A) Ana Sayfada Yedekli Kalıplarla Yayın Arama
            let streamUrl = extractStreamUrl(html);
            if (streamUrl) {
                return res.status(200).json({ basarili: true, streamUrl: streamUrl, type: 'm3u8' });
            }

            // B) Ana sayfada bulunamazsa Player Iframe adresini tespit et
            const $page = cheerio.load(html);
            let iframeSrc = $page('iframe').attr('src');

            if (!iframeSrc) {
                const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
                if (iframeMatch) iframeSrc = iframeMatch[1];
            }

            if (iframeSrc) {
                if (iframeSrc.startsWith('//')) iframeSrc = 'https:' + iframeSrc;
                else if (iframeSrc.startsWith('/')) iframeSrc = TARGET_DOMAIN + iframeSrc;

                // DERİN TARAMA: Iframe'in içine girip yayın adresini orada ara
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
                        return res.status(200).json({ basarili: true, streamUrl: innerStreamUrl, type: 'm3u8' });
                    }
                } catch (e) {
                    // Iframe içeriğine erişilemezse güvenli yedek olarak iframe adresini ver
                }

                return res.status(200).json({ basarili: true, streamUrl: iframeSrc, type: 'iframe' });
            }

            return res.status(200).json({ basarili: false, message: 'Yayın adresi veya player bulunamadı.' });
        }

        // 2. ANA MAÇ LİSTESİNİ ÇEKME (Bozulmayan Orijinal Yapı)
        const { data } = await axios.get(TARGET_DOMAIN, { headers: HEADERS });
        const $ = cheerio.load(data);
        const maclar = [];

        $('a[href*="/mac-izle/"]').each((i, element) => {
            const title = $(element).text().trim();
            const pageUrl = $(element).attr('href');
            
            const timeMatch = title.match(/\d{2}:\d{2}/);
            const time = timeMatch ? timeMatch[0] : 'CANLI';

            if (title && pageUrl) {
                maclar.push({
                    title: title.replace(/\s+/g, ' '),
                    time: time,
                    pageUrl: pageUrl.startsWith('http') ? pageUrl : `${TARGET_DOMAIN}${pageUrl}`
                });
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
            hata: error.message
        });
    }
};
