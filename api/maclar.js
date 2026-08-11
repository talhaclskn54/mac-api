const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    // CORS Başlıkları (Uygulamadan erişim için)
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

    try {
        // Hedef site adresi
        const targetUrl = 'https://taraftarium2spor.top/';
        const { data } = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(data);
        const maclar = [];

        // Sayfadaki maç linklerini ve başlıklarını tara
        $('a[href*="/mac-izle/"]').each((i, element) => {
            const title = $(element).text().trim();
            const pageUrl = $(element).attr('href');
            
            // Maç saati tespiti (Varsa alır, yoksa CANLI yazar)
            const timeMatch = title.match(/\d{2}:\d{2}/);
            const time = timeMatch ? timeMatch[0] : 'CANLI';

            if (title && pageUrl) {
                maclar.push({
                    title: title.replace(/\s+/g, ' '),
                    time: time,
                    pageUrl: pageUrl.startsWith('http') ? pageUrl : `https://taraftarium2spor.top${pageUrl}`
                });
            }
        });

        // M3U8 linkini sayfadan çekme endpoint'i isteği geldiyse
        if (req.query.getStream && req.query.url) {
            const matchPage = await axios.get(req.query.url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            // Sayfa kodunda geçen .m3u8 kalıplarını regex ile ayıkla
            const m3u8Match = matchPage.data.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
            
            if (m3u8Match && m3u8Match[0]) {
                return res.status(200).json({ basarili: true, streamUrl: m3u8Match[0] });
            } else {
                // Eğer doğrudan m3u8 bulunamazsa player iframe adresini bul
                const iframeMatch = matchPage.data.match(/<iframe[^>]+src=["']([^"']+)["']/i);
                if (iframeMatch && iframeMatch[1]) {
                    return res.status(200).json({ basarili: true, streamUrl: iframeMatch[1] });
                }
            }
            return res.status(200).json({ basarili: false, message: 'Yayın m3u8 adresi bulunamadı' });
        }

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
