// ============================================
// 🔥 إعدادات Firebase
// ============================================
// استبدل القيم أدناه بإعدادات مشروعك من Firebase Console
// راجع ملف SETUP.md للتعليمات التفصيلية
// ============================================

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyB8jWighY0cFTXsULgd2u_wrTwwp5AaS9w",
  authDomain: "salaf-89294.firebaseapp.com",
  projectId: "salaf-89294",
  storageBucket: "salaf-89294.firebasestorage.app",
  messagingSenderId: "391741848778",
  appId: "1:391741848778:web:f901c3bc5439f3547f8833",
  measurementId: "G-FLJRS2VW3Z"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
