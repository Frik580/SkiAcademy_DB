import { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { auth, db, doc, onSnapshot, updateDoc } from '../lib/firebase';
import { UserProfile } from '../types';

export const useAuth = () => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      let profileUnsubscribe: (() => void) | null = null;

      if (user) {
        setFirebaseUser(user);
        const userRef = doc(db, 'users', user.uid);
        
        profileUnsubscribe = onSnapshot(userRef, async (userSnap) => {
          if (userSnap.exists()) {
            const data = userSnap.data() as UserProfile;
            const isAdminEmail = user.email?.toLowerCase() === 'admin@alpineglide.com' || user.email?.toLowerCase() === 'gerasimchuk.arseniy@gmail.com';
            if (isAdminEmail && data.role !== 'admin') {
              try {
                await updateDoc(userRef, { role: 'admin' });
                data.role = 'admin'; // Optimistic update
              } catch (updateErr) {
                console.error("Failed to promote user to admin in Firestore", updateErr);
              }
            }
            setUserProfile(data);
          } else {
            setUserProfile(null);
          }
          if (authLoading) setAuthLoading(false);
        }, (error) => {
          console.error("Auth profile snapshot error:", error);
          setAuthLoading(false);
        });
      } else {
        setUserProfile(null);
        setFirebaseUser(null);
        setAuthLoading(false);
      }
      return () => { if (profileUnsubscribe) profileUnsubscribe(); };
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