import { db } from './firebase/client';
import { collection, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, serverTimestamp, query, where } from 'firebase/firestore';

export interface Facility {
  id?: string;
  name: string;
  category: '레저' | '숙박' | '식음' | '기타';
  description: string;
  location: string;
  tags: string[];
  status: 'pending' | 'approved';
  createdAt?: any;
  updatedAt?: any;
}

export interface Schedule {
  id?: string;
  facilityId: string;
  dayType: '평일' | '주말' | '특정일';
  openTime: string;
  closeTime: string;
}

export interface Pricing {
  id?: string;
  facilityId: string;
  priceType: string;
  amount: number;
  conditions: string;
}

const FACILITIES_COL = 'facilities';
const SCHEDULES_COL = 'schedules';
const PRICING_COL = 'pricing';

// --- Facilities ---

export async function createFacility(data: Omit<Facility, 'id' | 'createdAt' | 'updatedAt'>, docId?: string) {
  const colRef = collection(db, FACILITIES_COL);
  const docRef = docId ? doc(colRef, docId) : doc(colRef);
  
  const newFacility = {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(docRef, newFacility);
  return docRef.id;
}

export async function getFacility(id: string) {
  const docRef = doc(db, FACILITIES_COL, id);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as Facility;
  }
  return null;
}

export async function getAllFacilities() {
  const colRef = collection(db, FACILITIES_COL);
  const snapshot = await getDocs(colRef);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Facility));
}

export async function updateFacility(id: string, data: Partial<Facility>) {
  const docRef = doc(db, FACILITIES_COL, id);
  await updateDoc(docRef, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

// --- Schedules ---

export async function setSchedules(facilityId: string, schedules: Schedule[]) {
  // Batch write or individual sets. For simplicity, individual set:
  // In a real app, you might want to delete existing and recreate or use a subcollection.
  // We'll assume schedules have generated IDs or we just use facilityId + dayType as ID.
  for (const schedule of schedules) {
    const customId = `${facilityId}_${schedule.dayType}`;
    const docRef = doc(db, SCHEDULES_COL, customId);
    await setDoc(docRef, { ...schedule, facilityId });
  }
}

export async function getSchedulesByFacility(facilityId: string) {
  const colRef = collection(db, SCHEDULES_COL);
  const q = query(colRef, where('facilityId', '==', facilityId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Schedule));
}

// --- Pricing ---
export async function setPricing(facilityId: string, pricingList: Pricing[]) {
  for (const price of pricingList) {
    const customId = `${facilityId}_${price.priceType}`;
    const docRef = doc(db, PRICING_COL, customId);
    await setDoc(docRef, { ...price, facilityId });
  }
}

export async function getPricingByFacility(facilityId: string) {
  const colRef = collection(db, PRICING_COL);
  const q = query(colRef, where('facilityId', '==', facilityId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Pricing));
}
