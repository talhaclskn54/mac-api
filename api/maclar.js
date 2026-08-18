const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

module.exports = async (req, res) => {
    // CORS Başlıkları (Mobil Uygulama Erişimi)
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const TARGET_DOMAIN = 'https://www.ardaspor30.top';
    let browser = null;

    try {
        // Vercel Serverless için Chromium Başlatma
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });

        const page = await browser.newPage();

        // Tarayıcı Kimliği (User-Agent)
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        );

        // 1. DETAYLI YAYIN VE M3U8 LİNKİ YAKALAMA (?getStream=1&url=...)
        if (req.query.getStream && req.query.url) {
            const targetMatchUrl = req.query.url;
            let capturedM3u8 = null;

            // Ağ İsteklerini Dinle (Obfuscated JS veya Iframe fark etmeksizin M3U8'i yakalar)
            page.on('response', async (response) => {
                const url = response.url();
                if (url.includes('.m3u8') && !capturedM3u8) {
                    capturedM3u8 = url;
                }
            });

            await page.goto(targetMatchUrl, {
                waitUntil: 'networkidle2',
                timeout: 25000
            });

            // Sayfa içinde doğrudan regex taraması (Yedek adım)
            if (!capturedM3u8) {
                capturedM3u8 = await page.evaluate(() => {
                    const html = document.documentElement.innerHTML;
                    const match = html.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
                    return match ? match[0] : null;
                });
            }

            await browser.close();

            if (capturedM3u8) {
                return res.status(200).json({
                    basarili: true,
                    streamUrl: capturedM3u8,
                    type: 'm3u8'
                });
            } else {
                return res.status(200).json({
                    basarili: false,
                    message: 'Yayın m3u8 adresi ağ trafiğinde veya DOM yapısında bulunamadı.'
                });
            }
        }

        // 2. ANA SAYFADAN MAÇ VE CANLI KANAL LİSTESİNİ ÇEKME
        await page.goto(TARGET_DOMAIN, {
            waitUntil: 'domcontentloaded',
            timeout: 25000
        });

        // Dynamic elementlerin render olması için kısa bekleme
        await new Promise(resolve => setTimeout(resolve, 2500));

        const data = await page.evaluate((domain) => {
            const maclar = [];
            const kanallar = [];
            const links = Array.from(document.querySelectorAll('a'));

            links.forEach(a => {
                const text = (a.innerText || a.textContent || '').trim().replace(/\s+/g, ' ');
                let href = a.getAttribute('href');

                if (!href || href === '#' || href.startsWith('javascript:')) return;

                // URL formatlama
                if (href.startsWith('/')) href = domain + href;
                else if (!href.startsWith('http')) href = domain + '/' + href;

                // Saat Tespiti
                const timeMatch = text.match(/\b\d{2}:\d{2}\b/);
                const time = timeMatch ? timeMatch[0] : 'CANLI';

                // Maç Linklerini Filtreleme
                const isMatch = href.includes('mac') || href.includes('izle') || href.includes('match') || /\d+/.test(href);
                if (isMatch && text.length > 2) {
                    if (!maclar.some(m => m.pageUrl === href)) {
                        maclar.push({
                            title: text,
                            time: time,
                            pageUrl: href
                        });
                    }
                }

                // Canlı TV / Kanal Linklerini Filtreleme
                const isChannel = href.includes('kanal') || href.includes('tv') || href.includes('channel');
                if (isChannel && text.length > 1) {
                    if (!kanallar.some(k => k.pageUrl === href)) {
                        kanallar.push({
                            title: text,
                            pageUrl: href
                        });
                    }
                }
            });

            return { maclar, kanallar };
        }, TARGET_DOMAIN);

        await browser.close();

        return res.status(200).json({
            basarili: true,
            toplamMac: data.maclar.length,
            toplamKanal: data.kanallar.length,
            maclar: data.maclar,
            kanallar: data.kanallar
        });

    } catch (error) {
        if (browser !== null) await browser.close();
        return res.status(500).json({
            basarili: false,
            hata: error.message
        });
    }
};
