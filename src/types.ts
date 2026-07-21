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
  instructorId?: string;
  isInstructor?: boolean;
  isClientActive?: boolean;
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
  order?: number;
  shortDescription?: string;
  shortDescriptionRu?: string;
  detailedDescription?: string;
  detailedDescriptionRu?: string;
  badge?: string;
  badgeRu?: string;
  level?: 'beginner' | 'intermediate' | 'advanced' | 'expert' | '';
  levelLabel?: string;
}

export interface ChatMessage {
  id: string;
  bookingId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  text: string;
  timestamp: string;
  attachmentType?: 'image' | 'video' | 'link';
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentSize?: number;
}

export enum OperationType {
  GET = 'get',
  LIST = 'list',
  WRITE = 'write',
  UPDATE = 'update',
  DELETE = 'delete'
}

export interface ErrorLog {
  id: string;
  message: string;
  stack?: string;
  timestamp: string; // ISO String
  userId?: string;
  userEmail?: string;
  url: string;
  userAgent: string;
  source: string; // 'firestore' | 'global_error' | 'unhandled_rejection' | 'custom'
  operation?: string;
  path?: string;
}

export interface CustomHeroSlide {
  id: string;
  line1En: string;
  line1Ru: string;
  line2En: string;
  line2Ru: string;
  line3En: string;
  line3Ru: string;
  backgroundImage: string; // e.g. 'wall', 'wall2', etc., or custom url
}

export interface ResortConfig {
  nameEn: string;
  nameRu: string;
  subNameEn: string;
  subNameRu: string;
  latitude: number;
  longitude: number;
  showLifts?: boolean;
  openLifts?: number;
  totalLifts?: number;
  liftsStatusEn?: string;
  liftsStatusRu?: string;
  slides?: CustomHeroSlide[];
  slideIntervalSeconds?: number;
}

