import { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { auth, db, doc, getDoc, updateDoc } from '../lib/firebase';
import { UserProfile } from '../types';

export const useAuth = () => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setFirebaseUser(user);
        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            const data = userSnap.data() as UserProfile;
            const isAdminEmail = user.email?.toLowerCase() === 'admin@alpineglide.com' || user.email?.toLowerCase() === 'gerasimchuk.arseniy@gmail.com';
            if (isAdminEmail && data.role !== 'admin') {
              try {
                await updateDoc(userRef, { role: 'admin' });
                data.role = 'admin';
              } catch (updateErr) {
                console.error("Failed to promote user to admin in Firestore", updateErr);
              }
            }
            setUserProfile(data);
          } else {
            setUserProfile(null);
          }
        } catch (e) {
          console.error("Auth initialization failed", e);
        }
      } else {
        setUserProfile(null);
        setFirebaseUser(null);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUserProfile(null);
      setFirebaseUser(null);
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  return { firebaseUser, userProfile, authLoading, setUserProfile, handleSignOut };
};