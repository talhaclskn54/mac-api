const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    // CORS Başlıkları (Uygulamadan erişim izni)
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

    try {
        // 1. OYNATICI VEYA M3U8 LINKI AYIKLAMA (Sadece İzle Butonuna Basıldığında Çalışır)
        if (req.query.getStream && req.query.url) {
            const pageUrl = req.query.url;
            
            // Maçın kendi detay sayfasını çekiyoruz
            const matchPage = await axios.get(pageUrl, { headers: HEADERS });
            const html = matchPage.data;

            // A) Ana Sayfada Doğrudan .m3u8 Var mı?
            let m3u8Match = html.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
            if (m3u8Match && m3u8Match[0]) {
                return res.status(200).json({ basarili: true, streamUrl: m3u8Match[0], type: 'm3u8' });
            }

            // B) Yoksa Oynatıcı Iframe Adresini Bul
            const $page = cheerio.load(html);
            let iframeSrc = $page('iframe').attr('src');

            if (!iframeSrc) {
                const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
                if (iframeMatch) iframeSrc = iframeMatch[1];
            }

            if (iframeSrc) {
                if (iframeSrc.startsWith('//')) iframeSrc = 'https:' + iframeSrc;
                else if (iframeSrc.startsWith('/')) iframeSrc = TARGET_DOMAIN + iframeSrc;

                // DERİN TARAMA: Iframe sayfasının içine girip gizlenmiş .m3u8 linkini ayıkla
                try {
                    const iframePage = await axios.get(iframeSrc, {
                        headers: {
                            ...HEADERS,
                            'Referer': pageUrl
                        }
                    });
                    const iframeHtml = iframePage.data;
                    let innerM3u8 = iframeHtml.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
                    
                    if (innerM3u8 && innerM3u8[0]) {
                        return res.status(200).json({ basarili: true, streamUrl: innerM3u8[0], type: 'm3u8' });
                    }
                } catch (e) {
                    // Iframe içine erişilemezse güvenli yedek olarak iframe adresini döndür
                }

                return res.status(200).json({ basarili: true, streamUrl: iframeSrc, type: 'iframe' });
            }

            return res.status(200).json({ basarili: false, message: 'Yayın adresi veya player bulunamadı.' });
        }

        // 2. ANA MAÇ LİSTESİNİ ÇEKME (Orijinal Bozulan Hiçbir Şey Yok)
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
