export interface ChatMessage {
  id: string;
  bookingId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  senderRole?: 'client' | 'instructor' | 'admin';
  /** Instructor profile id when message is sent from the instructor panel. */
  senderInstructorId?: string;
  text: string;
  timestamp: string;
  attachmentType?: 'image' | 'video' | 'link';
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentSize?: number;
  /** Instructor marked this message as homework for the student cabinet. */
  isHomework?: boolean;
  /** Course group chat: specific student uids. Empty / unset = all enrolled students. */
  homeworkForUserIds?: string[];
}

export enum OperationType {
  GET = 'get',
  LIST = 'list',
  WRITE = 'write',
  UPDATE = 'update',
  DELETE = 'delete',
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
  hidden?: boolean;
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
  slidesRandomOrder?: boolean;
  usdToKztRate?: number;
  /** @deprecated Display currency is always KZT; retained for reading legacy resort_data/config. */
  currency?: 'USD' | 'KZT';
}
