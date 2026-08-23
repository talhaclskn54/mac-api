export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).send("URL parametresi eksik!");
  }

  const targetUrl = decodeURIComponent(url);

  try {
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Referer": "https://izle.livetvuk.com/"
      }
    });

    const data = await response.arrayBuffer();

    // CORS başlıklarını temizleyip dışa açıyoruz
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Content-Type", response.headers.get("content-type") || "text/html");

    return res.status(response.status).send(Buffer.from(data));
  } catch (error) {
    return res.status(500).send("Sunucu hatasi: " + error.message);
  }
}
