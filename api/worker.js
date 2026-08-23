export default {
  async fetch(request) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");

    if (!targetUrl) {
      return new Response("Eksik URL parametresi!", { status: 400 });
    }

    // Kanal sunucularının beklediği header yönlendirmeleri
    const modifiedHeaders = new Headers();
    modifiedHeaders.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    
    // Kanala göre Referer maskelemesi
    if (targetUrl.includes("turkuvaz")) {
      modifiedHeaders.set("Referer", "https://www.atv.com.tr/");
    } else if (targetUrl.includes("demiroren")) {
      modifiedHeaders.set("Referer", "https://www.kanald.com.tr/");
    } else if (targetUrl.includes("ciner")) {
      modifiedHeaders.set("Referer", "https://www.showtv.com.tr/");
    } else {
      modifiedHeaders.set("Referer", "https://www.google.com/");
    }

    try {
      const response = await fetch(targetUrl, {
        headers: modifiedHeaders
      });

      // CORS Engelini Kaldıran Header'lar
      const newHeaders = new Headers(response.headers);
      newHeaders.set("Access-Control-Allow-Origin", "*");
      newHeaders.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
      newHeaders.set("Access-Control-Allow-Headers", "*");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });
    } catch (e) {
      return new Response("Yayın çekilemedi: " + e.message, { status: 500 });
    }
  }
};
