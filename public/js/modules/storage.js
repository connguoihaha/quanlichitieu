import { db, collection, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, limit, doc, serverTimestamp } from '../firebase.js';
import { showToast } from '../utils.js';

export function listenToTransactions(onUpdate, onError) {
    if (!db) {
        showToast("Chưa cấu hình Firebase!", "error");
        return;
    }

    try {
        const q = query(collection(db, "transactions"), orderBy("date", "desc"), limit(2000));
        
        return onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => {
                 const d = doc.data();
                 return {
                    id: doc.id,
                    ...d,
                    date: d.date && d.date.toDate ? d.date.toDate() : (new Date(d.date) || new Date())
                 };
            });
            onUpdate(data, snapshot.metadata.fromCache);
        }, (error) => {
             console.error("Error getting realtime update: ", error);
             if (onError) onError(error);
        });
        
    } catch (e) {
        console.error("Error setting up listener", e);
        if (onError) onError(e);
    }
}

export async function addTransactionToDb(data) {
    if (!db) return null;
    return await addDoc(collection(db, "transactions"), {
        ...data,
        createdAt: serverTimestamp()
    });
}

export async function updateTransactionInDb(id, data) {
    if (!db) return;
    await updateDoc(doc(db, "transactions", id), {
         ...data,
        updatedAt: serverTimestamp()
    });
}

export async function deleteTransactionFromDb(id) {
    if (!db) return;
    await deleteDoc(doc(db, "transactions", id));
}
