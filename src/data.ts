import { Instructor, Review } from './types';

export const INITIAL_INSTRUCTORS: Instructor[] = [
  {
    id: 'ins_dimitri',
    name: 'Dimitri Romanov',
    specialty: 'ski',
    rating: 4.9,
    reviewsCount: 18,
    languages: ['English', 'Russian', 'German'],
    experienceYears: 10,
    bio: 'Certified alpine ski coach with over 10 years of experience in the Alps. Specializes in advanced carving, speed refinement, and race techniques. Friendly but highly precise in adjusting your stance.',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400',
    pricePerHour: 65,
    isAvailable: true
  },
  {
    id: 'ins_sophia',
    name: 'Sophia Laurent',
    specialty: 'snowboard',
    rating: 4.8,
    reviewsCount: 14,
    languages: ['English', 'German', 'French'],
    experienceYears: 8,
    bio: 'Former competitive snowboard athlete. Sophia specializes in modern freeriding, snowboard park freestyle, and teaching advanced turns in deep powder. Focused on flow and core stability.',
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=400',
    pricePerHour: 70,
    isAvailable: true
  },
  {
    id: 'ins_marcus',
    name: 'Marcus Kael',
    specialty: 'both',
    rating: 5.0,
    reviewsCount: 22,
    languages: ['English', 'German', 'Italian'],
    experienceYears: 15,
    bio: 'Legendary Austrian resort guide. Marcus has 15+ years of experience training both ski and snowboard students from absolute beginners to professional instructors. Known for his patience and deep snow knowledge.',
    avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=400',
    pricePerHour: 80,
    isAvailable: true
  },
  {
    id: 'ins_elena',
    name: 'Elena Rostova',
    specialty: 'ski',
    rating: 4.7,
    reviewsCount: 12,
    languages: ['English', 'French', 'Spanish'],
    experienceYears: 6,
    bio: 'Certified ski instructor specializing in children, families, and adult beginner-to-intermediate transformations. Her lessons are highly engaging, focusing on safety, rhythm, and building massive self-confidence.',
    avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=400',
    pricePerHour: 75,
    isAvailable: true
  }
];

export const INITIAL_REVIEWS: Review[] = [
  {
    id: 'rev_1',
    instructorId: 'ins_dimitri',
    userId: 'user_mock_1',
    userName: 'Alex Carter',
    userAvatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=alex',
    rating: 5,
    comment: 'Dimitri completely corrected my posture in just two hours! His tips on carving were highly practical and instantly improved my confidence on black slopes.',
    date: '2026-06-15'
  },
  {
    id: 'rev_2',
    instructorId: 'ins_sophia',
    userId: 'user_mock_2',
    userName: 'Chloe Dubois',
    userAvatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=chloe',
    rating: 5,
    comment: 'Amazing snowboard lesson with Sophia. She explained how to balance on powder snow in such an intuitive way. Can\'t recommend her enough for freeriding!',
    date: '2026-06-18'
  },
  {
    id: 'rev_3',
    instructorId: 'ins_marcus',
    userId: 'user_mock_3',
    userName: 'Hans Meyer',
    userAvatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=hans',
    rating: 5,
    comment: 'Marcus is an absolute legend. He knows every corner of the mountain and has an incredible teaching methodology. I was struggling with snowboarding but now I love it.',
    date: '2026-06-20'
  },
  {
    id: 'rev_4',
    instructorId: 'ins_elena',
    userId: 'user_mock_4',
    userName: 'Sarah Jenkins',
    userAvatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=sarah',
    rating: 4,
    comment: 'Elena was fantastic with our 8-year-old daughter. She made the ski lesson super fun, and our little one was skiing down blue tracks by the end of the day!',
    date: '2026-06-22'
  }
];

export const INITIAL_COURSES = [
  {
    id: 'course_carving_pro',
    title: 'Carving Mastery Pro',
    duration: '3 Days (12 Hours)',
    description: 'Unlock maximum speed and perfect edge control on high-velocity slopes. Designed for advanced skiers.',
    dates: 'July 15 - July 17, 2026',
    totalSeats: 10,
    availableSeats: 8,
    price: 299,
    bgImageUrl: 'https://images.unsplash.com/photo-1551698618-1ffdfe1d9772?auto=format&fit=crop&q=80&w=800',
    isHidden: false
  },
  {
    id: 'course_freeride_foundations',
    title: 'Freeride & Powder Foundations',
    duration: '2 Days (8 Hours)',
    description: 'Learn to navigate deep powder, select safe mountain lines, and master avalanche safety basics. Ski or Snowboard.',
    dates: 'July 20 - July 21, 2026',
    totalSeats: 6,
    availableSeats: 4,
    price: 199,
    bgImageUrl: 'https://images.unsplash.com/photo-1482867996988-2faec3cbb4f9?auto=format&fit=crop&q=80&w=800',
    isHidden: false
  },
  {
    id: 'course_snowboard_park',
    title: 'Snowboard Park & Freestyle Basics',
    duration: '4 Days (16 Hours)',
    description: 'Master jumps, rails, grabs, and spins in our specialized terrain park under the guidance of former athletes.',
    dates: 'July 24 - July 27, 2026',
    totalSeats: 8,
    availableSeats: 7,
    price: 349,
    bgImageUrl: 'https://images.unsplash.com/photo-1522056690101-aaeb3241b716?auto=format&fit=crop&q=80&w=800',
    isHidden: false
  }
];
