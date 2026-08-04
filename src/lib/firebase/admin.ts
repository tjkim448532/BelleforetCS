import * as admin from 'firebase-admin';
import { cookies } from 'next/headers';

export const getFirebaseAdminApp = () => {
  if (admin.apps.length > 0) {
    return admin.apps[0] as admin.app.App;
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!clientEmail || !privateKey || !projectId) {
    throw new Error('Firebase Admin is not fully configured. Please set the required environment variables.');
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
};

let db: admin.firestore.Firestore;
let auth: admin.auth.Auth;

try {
  db = getFirebaseAdminApp().firestore();
  db.settings({ ignoreUndefinedProperties: true });
  auth = getFirebaseAdminApp().auth();
} catch (error) {
  console.warn('Firebase Admin init failed:', error instanceof Error ? error.message : error);
  db = new Proxy({} as admin.firestore.Firestore, {
    get: (target, prop) => {
      if (prop === 'settings') return () => {};
      return () => { throw new Error('Firebase Admin not configured. Missing credentials.'); };
    }
  });
  auth = new Proxy({} as admin.auth.Auth, {
    get: (target, prop) => {
      return () => { throw new Error('Firebase Admin not configured. Missing credentials.'); };
    }
  });
}

export const adminDb = db;
export const adminAuth = auth;

export const verifyAdminSession = async (req?: Request) => {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('__session')?.value;
  
  if (!sessionCookie) {
    throw new Error('Unauthorized');
  }
  return await adminAuth.verifySessionCookie(sessionCookie, true);
};
