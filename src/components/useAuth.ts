import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { auth, db, doc, onSnapshot } from '../lib/firebase';
import { UserProfile } from '../types';

export const useAuth = () => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const profileUnsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      profileUnsubscribeRef.current?.();
      profileUnsubscribeRef.current = null;

      if (user) {
        setFirebaseUser(user);
        const userRef = doc(db, 'users', user.uid);
        
        profileUnsubscribeRef.current = onSnapshot(userRef, (userSnap) => {
          if (userSnap.exists()) {
            const data = userSnap.data() as UserProfile;
            setUserProfile(data);
          } else {
            setUserProfile(null);
          }
          setAuthLoading(false);
        }, (error) => {
          console.error("Auth profile snapshot error:", error);
          setAuthLoading(false);
        });
      } else {
        setUserProfile(null);
        setFirebaseUser(null);
        setAuthLoading(false);
      }
    });

    return () => {
      profileUnsubscribeRef.current?.();
      profileUnsubscribeRef.current = null;
      unsubscribeAuth();
    };
  }, []);

  const handleSignOut = async () => {
    try {
      profileUnsubscribeRef.current?.();
      profileUnsubscribeRef.current = null;
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