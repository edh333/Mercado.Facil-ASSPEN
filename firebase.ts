import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCa3QnGwbTyldoPqYeVO-L24iftVm7lsT8",
  authDomain: "mercado-facil-mt.firebaseapp.com",
  projectId: "mercado-facil-mt",
  storageBucket: "mercado-facil-mt.firebasestorage.app",
  messagingSenderId: "714788107870",
  appId: "1:714788107870:web:ee371b5398d060544ca6cf"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);