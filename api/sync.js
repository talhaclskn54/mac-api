import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
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
