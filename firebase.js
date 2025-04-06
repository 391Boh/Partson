


import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebase = {
  apiKey: "AIzaSyBaJJ4J4DcgQ8kLSP2_BY0FFjpGTDk91l0",
  // apiKey: process.env.FIREBASE_KEY,
  authDomain: "partson-585c2.firebaseapp.com",
  projectId: "partson-585c2",
  storageBucket: "partson-585c2.firebasestorage.app",
  messagingSenderId: "90082894857", // env
  appId: "1:90082894857:web:c4927d112ec7ee635244d8", // env
};

const app = initializeApp(firebase);
const auth = getAuth(app);
const db = getFirestore(app); 

export { app, auth ,db };