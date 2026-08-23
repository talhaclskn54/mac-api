// api/get-stream.js
const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'URL parametresi gerekli' });
    }

    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win32; x86) AppleWebKit/537.36'
            }
        });

        // m3u8 Regex desenleri
        const m3u8Match = data.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/i);
        
        if (m3u8Match) {
            res.status(200).json({ m3u8: m3u8Match[0] });
        } else {
            res.status(404).json({ error: 'm3u8 akış kaynağı bulunamadı' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
