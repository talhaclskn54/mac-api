import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.aether-7d48f,
      clientEmail: process.env.firebase-adminsdk-fbsvc@aether-7d48f.iam.gserviceaccount.com,
      privateKey: process.env.nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDlsoQf9t5uQeCJ\nOL4kEZ4mdfl89R051SHbd16c8dUlECicBduzGxluOXB6t8lwkToWjoK5viMZSx9W\nGAEslAtc4PoFa29Mif1m2tx+GjTB/KI3CUF925WIsM3S+PnMR+sfsyA+s6NdD/yc\nJhn55jAxq2tvr50Rc1wIuV5yfXvKyR/CNbViJP2QlPWD9lRPi1CeUxz/vFPMTiQf\nmYtjPcQcBf9WvxKscByp7ba3u8Bw+Wy29P2eV+2J3uh4UJAzhxTeFsri6opP0fN5\n/SU9pMfCQu2Hvz+iklqfUrls4GwcwMeS1q5+iFS6yrkdcqT/55yQ+q3zaxilqcrr\n6bce1QltAgMBAAECggEAILZnTbwVWoOETFap8a4WpWiY0vx/oIxjiYN7FIP2dJRU\nDEBjVSMvYHzKsZd6F09/g9Xg9T4IdqI1wMejZytgYOZjhSETVUWzspHJ5CWsTNJD\nce4eByQeLDzt2zV9MeQuLrIOjg98XRUZR02/1lC7nV9J6jqK9oDE4zMvKcQIPM1Z\n58UMWWs8oKhWl7pdF9XIAqTLOS8VZQzyobe4qLQP8AsdHsNCPOaimrS9OMM0lbyl\n1ajzTmjKF4cnL8LpaN5SbiYxvZzxL7EIWPCmsZzuhZfqGbTpPfUbC2Vy4MXF4h8R\nd49VCW1+r23Kej0bbpyhRFTPdEsBahXzmLNhZ5vckQKBgQDztNbGjNv4LUdNLaK/\nLaj1Nw7g2ViITd75zygGzgzW/toyFepYWHu32zBkajMdAP3KgSWZccbTy7H7h5BC\nvUO6PDZLkT6l7OKivfVFYexDdqxiOn48hHVSfa78K3Js92EQysyZhLniZ0v/DpeM\nxozudGeZtGtO3/iuUpn2bw5TFQKBgQDxSMSCc7UdJL2nPP9zqiZ+HZ0iDYEO+hyd\nj/+SQfth+2tgJdFQIsCN97+yLXxsZA8ejAXBM0U0/2gN+tsRVPkHiiz4SDsuk2Tt\nCL9Exc1ixwem+S/C5fxrcsyrDQ02YBXD9QNjB2xxZUvnthUgtP+RPp/WymdLyuSk\n4oSI/oPS+QKBgBGfWwSCfQmGJKjFCwauA5CvyYiizs8UanI/85ICZlVJmneStB5t\nT4zs8aPhNg772l5BVnmxC4KXMSiSFfFthC88WWS/fPs8lOrVt52rxgze0PpNZoFz\nxpQPeI7NiXmtrbwsHf1f5p0jgRBRes34MYqwqikoLbZHZdEdMfrq7us9AoGBAIe0\nobGtWmQ10eVJzXNEc7ni9gm9BqVhzs5fuyKLsdN+EPpWys8DfMFcYpjYNG7SKB7K\nKkJrj7UrIV8bhDLPU/EFqh1Kot6jT9RxYwJPLiEsSAWFiXNY3wuf2bUq9g9rI1K/\nb1Q3TKrKilKcem2W31bVnhi0ZjyetNJ4BIr4ezQhAoGABJ6OgYEgTC1mcCBRgLMB\n75ZdnOWhzq4jzNKZmLNKhwUqFlZ3N3JETS5wYHSjQaHsYYIbGEd7bQX58HoUPz39\nQSFzF5E8TKenxE5VkOGBhDpy2TqgwYg8Km+pxL5zVJnry4n8HKQjJa2rOlrOsO95\nyTKVUGXaJSfBvDcH7dZEtwc=\n?.replace(/\\n/g, '\n'),
    }),
    databaseURL: "https://aether-7d48f-default-rtdb.firebaseio.com"
  });
}

const db = admin.database();

export default async function handler(req, res) {
  try {
    const response = await fetch('https://mac-api-seven.vercel.app/api/maclar');
    const data = await response.json();

    if (data && data.basarili) {
      // Firebase Realtime Database üzerine yaz
      await db.ref('maclar').set(data);
      return res.status(200).json({ success: true, message: "Firebase verisi canlı güncellendi." });
    }
    
    return res.status(400).json({ success: false, message: "Veri çekilemedi." });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
