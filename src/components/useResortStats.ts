import { useState, useEffect, useCallback } from 'react';
import { db, doc, getDoc, setDoc, onSnapshot } from '../lib/firebase';
import { ResortConfig } from '../types';
import { logger } from '../lib/logger';

const DEFAULT_CONFIG: ResortConfig = {
  nameEn: 'Chamonix-Mont-Blanc',
  nameRu: 'Шамони-Монблан',
  subNameEn: 'French Alps resort',
  subNameRu: 'Курорт в Альпах',
  latitude: 45.9237,
  longitude: 6.8694,
  showLifts: true,
  openLifts: 13,
  totalLifts: 14,
  liftsStatusEn: 'OPEN',
  liftsStatusRu: 'ОТКРЫТО',
  slideIntervalSeconds: 6,
  slides: [
    {
      id: '1',
      line1En: 'Curated Experiences',
      line1Ru: 'Эксклюзивный сервис',
      line2En: 'Perfect your technique with our elite guides.',
      line2Ru: 'Совершенствуйте технику с лучшими гидами.',
      line3En: 'PROFESSIONAL TRAINING: ski and snowboard, from foundations to competitive mastery.',
      line3Ru: 'ПРОФЕССИОНАЛЬНОЕ ОБУЧЕНИЕ: лыжи и сноуборд, от азов до соревновательного мастерства.',
      backgroundImage: 'wall'
    },
    {
      id: '2',
      line1En: 'Premium Coaching',
      line1Ru: 'Индивидуальный подход',
      line2En: 'Confidence on alpine skis — without fear and chaos, starting from the very first lesson.',
      line2Ru: 'Уверенное катание на горных лыжах — без страха и хаоса уже с первого занятия.',
      line3En: 'TAILORED SESSIONS: Step-by-step guidance designed specifically for rapid confidence.',
      line3Ru: 'ПЕРСОНАЛЬНЫЙ ФОРМАТ: Пошаговая методика, разработанная для быстрого преодоления барьеров.',
      backgroundImage: 'wall2'
    },
    {
      id: '3',
      line1En: 'Alpine Mastery',
      line1Ru: 'Свобода движения',
      line2En: 'Learn to enjoy skiing regardless of your current experience level.',
      line2Ru: 'Научим получать удовольствие от катания независимо от вашего уровня.',
      line3En: 'EXPERT GUIDES: Discover the joy of fluid movement across all types of slopes.',
      line3Ru: 'ЭКСПЕРТНЫЙ КОНТРОЛЬ: Раскройте легкость скольжения на любых склонах курорта.',
      backgroundImage: 'wall3'
    }
  ]
};

export const useResortStats = () => {
  const [resortConfig, setResortConfig] = useState<ResortConfig>(DEFAULT_CONFIG);
  const [tempC, setTempC] = useState(0);
  const [snowDepthCm, setSnowDepthCm] = useState(0);
  const [newSnow24h, setNewSnow24h] = useState(0);
  const [windKmh, setWindKmh] = useState(0);
  const [openLifts, setOpenLifts] = useState(0);
  const [isFahrenheit, setIsFahrenheit] = useState(false);
  const [isResortLoading, setIsResortLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('--:--');

  // Real-time listener for resort configuration
  useEffect(() => {
    const configRef = doc(db, 'resort_data', 'config');
    const unsub = onSnapshot(configRef, (snap) => {
      if (snap.exists()) {
        setResortConfig(snap.data() as ResortConfig);
      } else {
        // Initialize config with defaults if it doesn't exist
        setDoc(configRef, DEFAULT_CONFIG).catch(err => logger.error("Error setting default config:", err));
        setResortConfig(DEFAULT_CONFIG);
      }
    });
    return () => unsub();
  }, []);

  const fetchResortStats = useCallback(async (config: ResortConfig) => {
    setIsResortLoading(true);
    const cacheRef = doc(db, 'resort_data', 'cache');

    try {
      // 1. Попытка прочитать из кеша Firestore
      const cacheSnap = await getDoc(cacheRef);
      if (cacheSnap.exists()) {
        const data = cacheSnap.data();
        const now = new Date().getTime();
        const lastUpdatedTime = data.lastUpdatedTimestamp || 0;

        // Использовать кеш, если он не старше 1 часа и координаты совпадают
        if (
          now - lastUpdatedTime < 3600 * 1000 &&
          data.latitude === config.latitude &&
          data.longitude === config.longitude
        ) {
          setTempC(data.tempC);
          setSnowDepthCm(data.snowDepthCm);
          setNewSnow24h(data.newSnow24h);
          setWindKmh(data.windKmh);
          setOpenLifts(data.openLifts);
          setLastUpdated(new Date(lastUpdatedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));          
          logger.debug("Weather data loaded from Firestore cache.");
          setIsResortLoading(false);
          return;
        }
      }

      // 2. Если кеш устарел или изменилась геолокация, запрашиваем API Open-Meteo
      logger.debug(`Fetching fresh weather data for Lat: ${config.latitude}, Lon: ${config.longitude} from API...`);

      const forecastApiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${config.latitude}&longitude=${config.longitude}&current=temperature_2m,wind_speed_10m&hourly=snow_depth&daily=snowfall_sum&timezone=auto`;

      const response = await fetch(forecastApiUrl);

      if (!response.ok) {
        logger.error("Forecast API Error:", await response.text());
        throw new Error('Failed to fetch weather data');
      }

      const forecastData = await response.json();

      // --- Обработка и установка состояний ---
      const newTempC = forecastData.current?.temperature_2m !== undefined ? Math.round(forecastData.current.temperature_2m) : -5;
      const newWindKmh = forecastData.current?.wind_speed_10m !== undefined ? Math.round(forecastData.current.wind_speed_10m) : 15;
      const newSnowfall24h = forecastData.daily?.snowfall_sum?.[0] !== undefined ? Math.round(forecastData.daily.snowfall_sum[0]) : 12;

      // Глубина снега в метрах, переводим в сантиметры.
      const firstHourlySnowDepth = forecastData.hourly?.snow_depth?.[0];
      const newSnowDepthCm = firstHourlySnowDepth !== undefined && firstHourlySnowDepth !== null
        ? Math.round(firstHourlySnowDepth * 100)
        : 175; // Запасной вариант по умолчанию

      // Улучшенная симуляция открытых подъемников (зависит от ветра)
      const baseOpenLifts = newWindKmh > 40 ? 8 : 13;
      const newOpenLifts = baseOpenLifts - Math.floor(Math.random() * 3);
      const updatedTimestamp = new Date();

      setTempC(newTempC);
      setWindKmh(newWindKmh);
      setSnowDepthCm(newSnowDepthCm);
      setNewSnow24h(newSnowfall24h);
      setOpenLifts(newOpenLifts);
      setLastUpdated(updatedTimestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

      // 3. Сохраняем свежие данные в кеш Firestore
      const dataToCache = {
        tempC: newTempC,
        windKmh: newWindKmh,
        snowDepthCm: newSnowDepthCm,
        newSnow24h: newSnowfall24h,
        openLifts: newOpenLifts,
        lastUpdatedTimestamp: updatedTimestamp.getTime(),
        latitude: config.latitude,
        longitude: config.longitude
      };
      // Cache writes are admin-only. A denied cache write must not discard
      // successfully fetched weather data for regular visitors.
      try {
        await setDoc(cacheRef, dataToCache);
        logger.debug("Weather data cached to Firestore.");
      } catch (cacheError) {
        logger.warn("Weather cache update skipped:", cacheError);
      }
    } catch (error) {
      logger.error("Error fetching resort stats:", error);
      // В случае ошибки устанавливаем запасные данные
      setTempC(-5);
      setSnowDepthCm(175);
      setNewSnow24h(12);
      setWindKmh(15);
      setOpenLifts(12);
    } finally {
      setIsResortLoading(false);
    }
  }, []);

  // При изменении конфигурации перезагружаем погоду
  useEffect(() => {
    fetchResortStats(resortConfig);
  }, [resortConfig, fetchResortStats]);

  return {
    resortConfig,
    tempC, snowDepthCm, newSnow24h, windKmh, openLifts,
    isFahrenheit, setIsFahrenheit,
    isResortLoading, lastUpdated,
    handleRefreshResortStats: () => fetchResortStats(resortConfig)
  };
};
