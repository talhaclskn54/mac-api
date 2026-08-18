const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

module.exports = async (req, res) => {
    // CORS Başlıkları
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') return res.status(200).end();

    const TARGET_DOMAIN = 'https://www.ardaspor30.top';
    let browser = null;

    try {
        browser = await puppeteer.launch({
            args: [
                ...chromium.args,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security'
            ],
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });

        const page = await browser.newPage();
        const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
        await page.setUserAgent(userAgent);

        // 1. TEKİL KANAL / MAÇIN YAYIN LİNKİNİ ÇEKME (?getStream=1&url=...)
        if (req.query.getStream && req.query.url) {
            const targetUrl = req.query.url;
            let capturedM3u8 = null;
            let refererHeader = targetUrl;

            // Ağ İsteklerini Dinleme (M3U8 ve HLS Akışlarını Yakala)
            page.on('request', request => {
                const url = request.url();
                if ((url.includes('.m3u8') || url.includes('/hls/')) && !capturedM3u8) {
                    capturedM3u8 = url;
                    const reqHeaders = request.headers();
                    if (reqHeaders['referer']) {
                        refererHeader = reqHeaders['referer'];
                    }
                }
            });

            try {
                await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
            } catch (e) {}

            // Oynatıcı butonlarına tıklama simülasyonu
            await page.evaluate(() => {
                const selectors = ['.play', '.play-btn', '#player', 'iframe', 'video', '.vjs-big-play-button', 'a[href*="play"]'];
                selectors.forEach(selector => {
                    document.querySelectorAll(selector).forEach(btn => {
                        try { btn.click(); } catch(err) {}
                    });
                });
            });

            // İsteğin tetiklenmesi için 3 saniye bekle
            await new Promise(r => setTimeout(r, 3000));

            // Ağda yakalanamadıysa Iframe içine girerek derin tarama yap
            if (!capturedM3u8) {
                const iframeUrl = await page.evaluate(() => {
                    const iframe = document.querySelector('iframe');
                    return iframe ? iframe.src : null;
                });

                if (iframeUrl) {
                    let cleanIframe = iframeUrl;
                    if (cleanIframe.startsWith('//')) cleanIframe = 'https:' + cleanIframe;
                    else if (cleanIframe.startsWith('/')) cleanIframe = TARGET_DOMAIN + cleanIframe;

                    try {
                        await page.goto(cleanIframe, { waitUntil: 'domcontentloaded', timeout: 15000 });
                        await page.evaluate(() => {
                            document.querySelectorAll('video, #player, .play').forEach(el => {
                                try { el.click(); } catch(e) {}
                            });
                        });
                        await new Promise(r => setTimeout(r, 2500));
                    } catch(e) {}
                }
            }

            await browser.close();

            if (capturedM3u8) {
                return res.status(200).json({
                    basarili: true,
                    streamUrl: capturedM3u8,
                    headers: {
                        "Referer": refererHeader,
                        "User-Agent": userAgent
                    },
                    type: 'm3u8'
                });
            } else {
                return res.status(200).json({
                    basarili: false,
                    message: 'M3U8 yayın adresi tetiklenemedi veya player engeline takıldı.'
                });
            }
        }

        // 2. ANA SAYFA MAÇ VE KANAL LİSTESİNİ ÇEKME
        await page.goto(TARGET_DOMAIN, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await new Promise(r => setTimeout(r, 2500));

        const data = await page.evaluate((domain) => {
            const maclar = [];
            const kanallar = [];
            const links = Array.from(document.querySelectorAll('a'));

            links.forEach(a => {
                const text = (a.innerText || a.textContent || '').trim().replace(/\s+/g, ' ');
                let href = a.getAttribute('href');

                if (!href || href === '#' || href.startsWith('javascript:')) return;

                if (href.startsWith('/')) href = domain + href;
                else if (!href.startsWith('http')) href = domain + '/' + href;

                const timeMatch = text.match(/\b\d{2}:\d{2}\b/);
                const time = timeMatch ? timeMatch[0] : 'CANLI';

                // Maç Linkleri
                if ((href.includes('mac') || href.includes('izle') || /\d+/.test(href)) && text.length > 2) {
                    if (!maclar.some(m => m.pageUrl === href)) {
                        maclar.push({ title: text, time: time, pageUrl: href });
                    }
                }

                // Canlı TV / Kanal Linkleri
                if ((href.includes('kanal') || href.includes('tv') || href.includes('channel') || href.includes('bein') || href.includes('ssport')) && text.length > 1) {
                    if (!kanallar.some(k => k.pageUrl === href)) {
                        kanallar.push({ title: text, pageUrl: href });
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
        if (browser) await browser.close();
        return res.status(500).json({ basarili: false, hata: error.message });
    }
};
