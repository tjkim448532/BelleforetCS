import * as admin from 'firebase-admin';

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

export const verifyAdminSession = async (req: Request) => {
  const sessionCookie = req.headers.get('cookie')?.split('__session=')[1]?.split(';')[0];
  if (!sessionCookie) {
    throw new Error('Unauthorized');
  }
  return await adminAuth.verifySessionCookie(sessionCookie, true);
};
