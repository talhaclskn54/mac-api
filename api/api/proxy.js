export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).send("Eksik URL parametresi!");
  }

  // Kanal sunucularının beklediği header yönlendirmeleri
  const targetUrl = decodeURIComponent(url);
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  };

  if (targetUrl.includes("turkuvaz")) {
    headers["Referer"] = "https://www.atv.com.tr/";
  } else if (targetUrl.includes("demiroren")) {
    headers["Referer"] = "https://www.kanald.com.tr/";
  } else if (targetUrl.includes("ciner")) {
    headers["Referer"] = "https://www.showtv.com.tr/";
  } else {
    headers["Referer"] = "https://www.google.com/";
  }

  try {
    const response = await fetch(targetUrl, { headers });
    const data = await response.arrayBuffer();

    // CORS Engelini Kaldıran Header'lar
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/x-mpegURL");

    return res.status(response.status).send(Buffer.from(data));
  } catch (error) {
    return res.status(500).send("Yayın çekilemedi: " + error.message);
  }
}
