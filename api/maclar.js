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

    const source = req.query.source || 'taraftarium';

    const DOMAINS = {
        taraftarium: 'https://taraftarium2spor.top',
        zbahis: 'https://zbahistv65.com'
    };

    const TARGET_DOMAIN = DOMAINS[source] || DOMAINS.taraftarium;

    const HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': `${TARGET_DOMAIN}/`,
        'Origin': TARGET_DOMAIN,
        'Accept': '*/*',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7'
    };

    // GELİŞMİŞ REKLAMSIZ M3U8 VE GİZLİ SCRIPT AYIKLAMA
    function extractStreamUrl(htmlContent) {
        if (!htmlContent) return null;

        const streamPatterns = [
            // 1. Standart m3u8 URL yapıları
            /(https?:\/\/[^\s"'<>]+?\.m3u8[^\s"'<>]*)/i,
            /file:\s*["'](https?:\/\/[^\s"'<>]+?\.m3u8[^"']*)["']/i,
            /source\s*:\s*["'](https?:\/\/[^\s"'<>]+?\.m3u8[^"']*)["']/i,
            /src\s*:\s*["'](https?:\/\/[^\s"'<>]+?\.m3u8[^"']*)["']/i,
            // 2. Şifreli / Tokenlı HLS Kalıpları
            /["'](https?:\/\/[^"']+\/hls\/[^"']+)["']/i,
            /["'](https?:\/\/[^"']+\/live\/[^"']+)["']/i,
            // 3. Base64 veya Clappr/JWPlayer değişkenleri
            /var\ courseUrl\s*=\s*["']([^"']+)["']/i,
            /(https?:\/\/[^\s"'<>]+?\.mp4[^\s"'<>]*)/i
        ];

        for (let pattern of streamPatterns) {
            let match = htmlContent.match(pattern);
            if (match) {
                let url = match[1] || match[0];
                // Reklam js veya tık izleme scriptlerini hariç tut
                if (!url.includes('google') && !url.includes('analytics') && !url.includes('pop') && !url.includes('ad.')) {
                    return url;
                }
            }
        }
        return null;
    }

    try {
        // 1. OYNATICI VEYA M3U8 LINKI AYIKLAMA (Tekil Yayın İsteği)
        if (req.query.getStream && req.query.url) {
            const pageUrl = req.query.url;
            
            const matchPage = await axios.get(pageUrl, { headers: HEADERS, timeout: 8000 });
            const html = matchPage.data;

            // A) Doğrudan Sayfa İçi M3U8 Arama
            let streamUrl = extractStreamUrl(html);
            if (streamUrl) {
                return res.status(200).json({ basarili: true, streamUrl: streamUrl, type: 'm3u8' });
            }

            // B) Player Iframe'lerini Ayıklama (Reklam, Chat ve Skor Widget'larını Filtrele)
            const $page = cheerio.load(html);
            let candidateIframes = [];

            $page('iframe').each((i, el) => {
                const src = $page(el).attr('src') || $page(el).attr('data-src');
                if (src) {
                    const lowerSrc = src.toLowerCase();
                    // Reklam, canlı skor, chat ve sosyal medya iframelerini engelle
                    const isAdOrWidget = lowerSrc.includes('chat') || 
                                         lowerSrc.includes('reklam') || 
                                         lowerSrc.includes('score') || 
                                         lowerSrc.includes('skor') || 
                                         lowerSrc.includes('bet') || 
                                         lowerSrc.includes('banner') || 
                                         lowerSrc.includes('google');
                    if (!isAdOrWidget) {
                        candidateIframes.push(src);
                    }
                }
            });

            // Eğer listeden filtreli iframe çıkmazsa regex ile tara
            if (candidateIframes.length === 0) {
                const iframeMatches = html.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi);
                for (const match of iframeMatches) {
                    const src = match[1];
                    if (!src.includes('chat') && !src.includes('reklam') && !src.includes('score') && !src.includes('skor')) {
                        candidateIframes.push(src);
                    }
                }
            }

            // C) Bulunan Iframe'lerin İçine Girip Derin M3U8 Taraması Yap
            for (let iframeSrc of candidateIframes) {
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

                    const iframeHtml = iframePage.data;
                    let innerStreamUrl = extractStreamUrl(iframeHtml);

                    // Eğer Iframe içindeki JS'lerde M3U8 yakalandıysa doğrudan onu döndür (Sıfır Reklam)
                    if (innerStreamUrl) {
                        return res.status(200).json({ basarili: true, streamUrl: innerStreamUrl, type: 'm3u8' });
                    }
                } catch (e) {
                    // Iframe içeriğine erişilemezse sonraki adımlara geç
                }
            }

            // D) M3U8 hiçbir şekilde çıkarılamazsa en temiz iframe'i fallback ver
            if (candidateIframes.length > 0) {
                let finalIframe = candidateIframes[0];
                if (finalIframe.startsWith('//')) finalIframe = 'https:' + finalIframe;
                else if (finalIframe.startsWith('/')) finalIframe = TARGET_DOMAIN + finalIframe;
                return res.status(200).json({ basarili: true, streamUrl: finalIframe, type: 'iframe' });
            }

            return res.status(200).json({ basarili: false, message: 'Yayın adresi veya player bulunamadı.' });
        }

        // 2. ANA MAÇ LİSTESİNİ ÇEKME
        const { data } = await axios.get(TARGET_DOMAIN, { headers: HEADERS, timeout: 8000 });
        const $ = cheerio.load(data);
        const maclar = [];

        if (source === 'zbahis') {
            $('a[href*="/izle/"], a[href*="/channel/"], a[href*="/mac/"], .event-item a, .match-card a').each((i, element) => {
                const title = $(element).text().trim();
                let pageUrl = $(element).attr('href');
                
                const timeMatch = title.match(/\d{2}:\d{2}/);
                const time = timeMatch ? timeMatch[0] : 'CANLI';

                if (title && pageUrl && pageUrl !== '#' && !pageUrl.startsWith('javascript')) {
                    if (!pageUrl.startsWith('http')) {
                        pageUrl = pageUrl.startsWith('/') ? `${TARGET_DOMAIN}${pageUrl}` : `${TARGET_DOMAIN}/${pageUrl}`;
                    }

                    maclar.push({
                        title: title.replace(/\s+/g, ' ').trim(),
                        time: time,
                        pageUrl: pageUrl
                    });
                }
            });
        } else {
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
        }

        res.status(200).json({
            basarili: true,
            kaynak: source,
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
