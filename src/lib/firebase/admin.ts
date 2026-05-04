import * as admin from 'firebase-admin';
import { cookies } from 'next/headers';

export const getFirebaseAdminApp = () => {
  if (admin.apps.length > 0) {
    return admin.apps[0] as admin.app.App;
  }

  // To initialize the admin SDK, you should provide the service account key.
  // In development, you can use GOOGLE_APPLICATION_CREDENTIALS or provide the private key details.
  // Since we are mocking or getting this later:
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!clientEmail || !privateKey || !projectId) {
    console.warn('Firebase Admin is not fully configured. Please set the required environment variables.');
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: projectId || 'mock-project-id',
      clientEmail: clientEmail || 'mock-client-email',
      privateKey: privateKey || 'mock-private-key',
    }),
  });
};

export const adminDb = getFirebaseAdminApp().firestore();
export const adminAuth = getFirebaseAdminApp().auth();

export const verifyAdminSession = async (req?: Request) => {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('__session')?.value;
  
  if (!sessionCookie) {
    throw new Error('Unauthorized');
  }
  return await adminAuth.verifySessionCookie(sessionCookie, true);
};
