import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    query, 
    where, 
    orderBy, 
    limit,
    serverTimestamp,
    doc,
    deleteDoc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// TODO: Replace with your Firebase Project Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAHdKExcffXmBED5-15Kjf70z_TF2KAMy8",
    authDomain: "quanlichitieu-21cd9.firebaseapp.com",
    projectId: "quanlichitieu-21cd9",
    storageBucket: "quanlichitieu-21cd9.firebasestorage.app",
    messagingSenderId: "480248345196",
    appId: "1:480248345196:web:bd66b4356c53986f351e49",
    measurementId: "G-9R08BLS0SX"
};

let app;
let db;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    console.log("Firebase initialized");
} catch (e) {
    console.warn("Firebase config missing or invalid. App allows UI preview but data won't save.");
}

export { db, collection, addDoc, getDocs, query, where, orderBy, limit, serverTimestamp, doc, deleteDoc, updateDoc };
