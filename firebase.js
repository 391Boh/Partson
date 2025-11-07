// firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBaJJ4J4DcgQ8kLSP2_BY0FFjpGTDk91l0",
  authDomain: "partson-585c2.firebaseapp.com",
  projectId: "partson-585c2",
  storageBucket: "partson-585c2.firebasestorage.app",
  messagingSenderId: "90082894857",
  appId: "1:90082894857:web:c4927d112ec7ee635244d8",
  measurementId: "G-B56XGEPJPT"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
