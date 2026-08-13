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
  pricePerHourKZT?: number;
  isAvailable: boolean;
  /** Public contact phone — used by students to call the coach during lessons. */
  phoneNumber?: string;
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
