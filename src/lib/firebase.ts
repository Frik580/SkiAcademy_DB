import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  query, 
  getDocs,
  where,
  addDoc
} from 'firebase/firestore';
import { OperationType } from '../types';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Initialize with specific databaseId if required by config
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "ai-studio-b875cbe2-58f8-430e-b2c5-e0a453c4f8a4");
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Allow registering a global callback for database errors (e.g. to show custom error banners in UI)
type ErrorListener = (error: any, operation: OperationType, path: string) => void;
let errorListener: ErrorListener | null = null;

export function registerFirestoreErrorListener(listener: ErrorListener) {
  errorListener = listener;
}

export function handleFirestoreError(err: any, operation: OperationType, path: string) {
  console.error(`[Firestore Error] Operation: ${operation}, Path: ${path}`, err);
  if (errorListener) {
    errorListener(err, operation, path);
  } else {
    // Fallback alert/toast warning
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`Database permission or structure issue while doing '${operation}' on '${path}': ${msg}`);
  }
}

export async function migratePreExistingProfile(newUid: string, email: string, customDisplayName?: string): Promise<any | null> {
  if (!email) return null;
  const normalizedEmail = email.toLowerCase().trim();
  console.log(`Starting migration for email: ${normalizedEmail} to newUid: ${newUid}`);
  
  try {
    let usnap;
    try {
      const uq = query(collection(db, 'users'), where('email', '==', normalizedEmail));
      usnap = await getDocs(uq);
      console.log(`Successfully fetched users count: ${usnap.size}`);
    } catch (err: any) {
      console.error("Migration error at step 1: Query users by email failed", err);
      throw new Error(`Query users failed: ${err.message}`);
    }
    
    let oldProfile: any = null;
    let oldUid = '';
    
    usnap.forEach((doc) => {
      if (doc.id !== newUid) {
        oldProfile = doc.data();
        oldUid = doc.id;
      }
    });
    
    if (!oldProfile || !oldUid) {
      console.log("No pre-existing profile to migrate.");
      return null;
    }
    
    console.log(`Found pre-existing user: oldUid=${oldUid}, startsWith('client_')=${oldUid.startsWith('client_')}`);
    
    // Only migrate if the pre-existing profile was created by an admin
    if (!oldUid.startsWith('client_')) {
      console.log(`Found pre-existing user with uid ${oldUid}, but it is not an admin-created client profile.`);
      return null;
    }
    
    const migratedProfile = {
      ...oldProfile,
      uid: newUid,
      ...(customDisplayName ? { displayName: customDisplayName } : {})
    };
    
    try {
      console.log(`Writing migrated profile to users/${newUid}...`);
      await setDoc(doc(db, 'users', newUid), migratedProfile);
      console.log(`Successfully wrote migrated profile to users/${newUid}`);
    } catch (err: any) {
      console.error(`Migration error at step 2: setDoc to users/${newUid} failed`, err);
      throw new Error(`Write user profile failed: ${err.message}`);
    }
    
    try {
      console.log(`Checking bookings for oldUid: ${oldUid}...`);
      const bQuery = query(collection(db, 'bookings'), where('userId', '==', oldUid));
      const bSnap = await getDocs(bQuery);
      console.log(`Found ${bSnap.size} bookings to update.`);
      for (const bDoc of bSnap.docs) {
        console.log(`Updating booking ${bDoc.id}...`);
        await updateDoc(doc(db, 'bookings', bDoc.id), { userId: newUid });
      }
      console.log("Bookings update complete.");
    } catch (err: any) {
      console.error("Migration error at step 3: Update bookings failed", err);
      throw new Error(`Update bookings failed: ${err.message}`);
    }
    
    try {
      console.log(`Checking reviews for oldUid: ${oldUid}...`);
      const rQuery = query(collection(db, 'reviews'), where('userId', '==', oldUid));
      const rSnap = await getDocs(rQuery);
      console.log(`Found ${rSnap.size} reviews to update.`);
      for (const rDoc of rSnap.docs) {
        console.log(`Updating review ${rDoc.id}...`);
        await updateDoc(doc(db, 'reviews', rDoc.id), { userId: newUid });
      }
      console.log("Reviews update complete.");
    } catch (err: any) {
      console.error("Migration error at step 4: Update reviews failed", err);
      throw new Error(`Update reviews failed: ${err.message}`);
    }
    
    try {
      console.log(`Deleting old user profile users/${oldUid}...`);
      await deleteDoc(doc(db, 'users', oldUid));
      console.log(`Successfully deleted old user profile users/${oldUid}`);
    } catch (err: any) {
      console.error(`Migration error at step 5: Deleting users/${oldUid} failed`, err);
      throw new Error(`Delete old profile failed: ${err.message}`);
    }
    
    console.log(`Successfully migrated profile and data from ${oldUid} to ${newUid}`);
    return migratedProfile;
  } catch (err: any) {
    console.error("Error migrating pre-existing profile:", err);
    throw err;
  }
}

export { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  query, 
  getDocs,
  where,
  addDoc,
  GoogleAuthProvider,
  signInWithPopup,
  OperationType
};
