import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDTgZcrRlJODOGwO5uAtpx6lOwxaU0jFWE",
  authDomain: "mercadofacilasspen.firebaseapp.com",
  projectId: "mercadofacilasspen",
  storageBucket: "mercadofacilasspen.firebasestorage.app",
  messagingSenderId: "922222973022",
  appId: "1:922222973022:web:85b3eb72fc41c0fbb5a4cf"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);