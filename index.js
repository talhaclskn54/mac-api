const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
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
        'Origin': TARGET_DOMAIN
    };

    try {
        // 1. GÜÇLÜ YAYIN LİNKİ ÇÖZME (Puppeteer ile Tarayıcı Simülasyonu)
        if (req.query.getStream && req.query.url) {
            let pageUrl = req.query.url;
            if (!pageUrl.startsWith('http')) {
                pageUrl = `${TARGET_DOMAIN}${pageUrl.startsWith('/') ? '' : '/'}${pageUrl}`;
            }

            let streamUrl = null;

            // Tarayıcıyı başlat (Vercel uyumlu headless chromium)
            const browser = await puppeteer.launch({
                args: chromium.args,
                defaultViewport: chromium.defaultViewport,
                executablePath: await chromium.executablePath(),
                headless: chromium.headless,
                ignoreHTTPSErrors: true,
            });

            const page = await browser.newPage();
            
            // Gerçek bir kullanıcı gibi görünmek için User-Agent ayarla
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

            // Ağ trafiğini dinleyerek .m3u8 veya video isteklerini yakala
            page.on('request', (request) => {
                const url = request.url();
                if (url.includes('.m3u8') || url.includes('.ts') || url.includes('playlist')) {
                    if (!streamUrl) streamUrl = url;
                }
            });

            // Sayfaya git ve scriptlerin yüklenmesini bekle
            await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 15000 });

            // Sayfa içerisindeki HTML'den de m3u8 arayalım
            const htmlContent = await page.content();
            const m3u8Match = htmlContent.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
            if (m3u8Match && !streamUrl) {
                streamUrl = m3u8Match[1];
            }

            // Eğer hala bulunamadıysa iframe içini kontrol et
            if (!streamUrl) {
                const frames = page.frames();
                for (const frame of frames) {
                    const frameHtml = await frame.content();
                    const frameMatch = frameHtml.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
                    if (frameMatch) {
                        streamUrl = frameMatch[1];
                        break;
                    }
                }
            }

            await browser.close();

            if (streamUrl) {
                return res.status(200).json({ basarili: true, streamUrl: streamUrl });
            } else {
                return res.status(200).json({ basarili: false, message: 'Güvenlik duvarı nedeniyle yayın linki çözülemedi.' });
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
