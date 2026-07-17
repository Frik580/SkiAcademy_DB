export type Language = 'en' | 'de' | 'fr' | 'ru' | 'it' | 'es';

export type LessonDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'freeride' | 'freestyle';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber?: string;
  role: 'user' | 'admin';
  avatarUrl: string;
  balanceUSD: number;
}

export interface Instructor {
  id: string;
  name: string;
  specialty: 'ski' | 'snowboard' | 'both';
  rating: number;
  reviewsCount: number;
  languages: string[];
  experienceYears: number;
  bio: string;
  avatarUrl: string;
  pricePerHour: number;
  isAvailable: boolean;
}

export interface Review {
  id: string;
  instructorId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  rating: number;
  comment: string;
  date: string;
  bookingId?: string;
}

export interface Booking {
  id: string;
  userId: string;
  instructorId: string;
  instructorName: string;
  instructorAvatar: string;
  date: string;
  time: string;
  durationHours: number;
  totalPrice: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'pending_cancellation';
  difficulty: LessonDifficulty;
  notes?: string;
  cancellationReason?: string;
  isDeleted?: boolean;
}

export interface Course {
  id: string;
  title: string;
  duration: string;
  description: string;
  dates: string;
  totalSeats: number;
  availableSeats: number;
  price: number;
  bgImageUrl: string;
  isHidden?: boolean;
  instructorIds?: string[];
}

export enum OperationType {
  GET = 'get',
  LIST = 'list',
  WRITE = 'write',
  UPDATE = 'update',
  DELETE = 'delete'
}
