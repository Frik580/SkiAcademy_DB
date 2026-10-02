import { useState, useEffect } from 'react';
import {
  subscribeResortConfig,
  readCachedResortConfig,
  writeCachedResortConfig,
} from '../features/settings';
import { ResortConfig } from '../types';
import { logger } from '../shared';
import { useResortConditions } from '../features/resort-conditions';

const DEFAULT_CONFIG: ResortConfig = {
  nameEn: 'Shymbulak Mountain Resort',
  nameRu: 'Shymbulak Mountain Resort',
  subNameEn: 'Resort in Kazakhstan',
  subNameRu: 'Курорт в Казахстане',
  latitude: 43.1281,
  longitude: 77.0808,
  showLifts: false,
  openLifts: 13,
  totalLifts: 14,
  liftsStatusEn: 'OPEN',
  liftsStatusRu: 'ОТКРЫТО',
  slideIntervalSeconds: 8,
  slides: [
    {
      id: '1',
      line1En: 'Curated Experiences',
      line1Ru: 'Эксклюзивный сервис',
      line2En: 'Perfect your technique with our elite guides.',
      line2Ru: 'Совершенствуйте технику с лучшими гидами.',
      line3En: 'PROFESSIONAL TRAINING: ski and snowboard, from foundations to competitive mastery.',
      line3Ru:
        'ПРОФЕССИОНАЛЬНОЕ ОБУЧЕНИЕ: лыжи и сноуборд, от азов до соревновательного мастерства.',
      backgroundImage: 'wall',
    },
    {
      id: '2',
      line1En: 'Premium Coaching',
      line1Ru: 'Индивидуальный подход',
      line2En:
        'Confidence on alpine skis — without fear and chaos, starting from the very first lesson.',
      line2Ru: 'Уверенное катание на горных лыжах — без страха и хаоса уже с первого занятия.',
      line3En:
        'TAILORED SESSIONS: Step-by-step guidance designed specifically for rapid confidence.',
      line3Ru:
        'ПЕРСОНАЛЬНЫЙ ФОРМАТ: Пошаговая методика, разработанная для быстрого преодоления барьеров.',
      backgroundImage: 'wall2',
    },
    {
      id: '3',
      line1En: 'Alpine Mastery',
      line1Ru: 'Свобода движения',
      line2En: 'Learn to enjoy skiing regardless of your current experience level.',
      line2Ru: 'Научим получать удовольствие от катания независимо от вашего уровня.',
      line3En: 'EXPERT GUIDES: Discover the joy of fluid movement across all types of slopes.',
      line3Ru: 'ЭКСПЕРТНЫЙ КОНТРОЛЬ: Раскройте легкость скольжения на любых склонах курорта.',
      backgroundImage: 'wall3',
    },
  ],
};

export const useResortStats = () => {
  const [resortConfig, setResortConfig] = useState<ResortConfig>(() => {
    return readCachedResortConfig() ?? DEFAULT_CONFIG;
  });
  const [isResortConfigReady, setIsResortConfigReady] = useState(() => {
    return readCachedResortConfig() !== null;
  });
  const [isFahrenheit, setIsFahrenheit] = useState(() => {
    try {
      return localStorage.getItem('carve_temperature_unit') === 'fahrenheit';
    } catch {
      return false;
    }
  });
  const { conditions, refresh } = useResortConditions(resortConfig, isResortConfigReady);
  useEffect(() => {
    try {
      localStorage.setItem('carve_temperature_unit', isFahrenheit ? 'fahrenheit' : 'celsius');
    } catch {
      // The unit switch also works when browser storage is unavailable.
    }
  }, [isFahrenheit]);

  // Real-time listener for resort configuration
  useEffect(() => {
    return subscribeResortConfig(
      (config) => {
        const next = config ?? DEFAULT_CONFIG;
        setResortConfig(next);
        writeCachedResortConfig(next);
        setIsResortConfigReady(true);
      },
      (error) => {
        logger.error('Resort config sync error:', error);
        // Keep cached slides if we have them; otherwise fall back so the page is usable.
        setIsResortConfigReady(true);
      }
    );
  }, []);

  return {
    resortConfig,
    isResortConfigReady,
    conditions,
    tempC: conditions.data?.temperatureC ?? null,
    snowDepthCm: conditions.data?.snowDepthCm ?? null,
    newSnow24h: null,
    windKmh: conditions.data?.windKmh ?? null,
    weatherCode: conditions.data?.weatherCode ?? null,
    openLifts: conditions.data?.liftsOpen ?? null,
    isFahrenheit,
    setIsFahrenheit,
    isResortLoading: conditions.status === 'loading',
    lastUpdated: conditions.data?.updatedAt ?? '',
    handleRefreshResortStats: refresh,
  };
};
