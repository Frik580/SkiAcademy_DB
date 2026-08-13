import { useState, useEffect, useCallback } from 'react';
import { db, doc, getDoc, setDoc, onSnapshot } from '../lib/firebase';
import { ResortConfig } from '../types';
import { logger } from '../lib/logger';

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
  const [resortConfig, setResortConfig] = useState<ResortConfig>(DEFAULT_CONFIG);
  const [tempC, setTempC] = useState(0);
  const [snowDepthCm, setSnowDepthCm] = useState(0);
  const [newSnow24h, setNewSnow24h] = useState(0);
  const [windKmh, setWindKmh] = useState(0);
  const [weatherCode, setWeatherCode] = useState(0);
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
        setResortConfig(DEFAULT_CONFIG);
      }
    });
    return () => unsub();
  }, []);

  const fetchResortStats = useCallback(async (config: ResortConfig) => {
    setIsResortLoading(true);
    const cacheRef = doc(db, 'resort_data', 'cache');

    try {
      const cacheSnap = await getDoc(cacheRef);
      if (cacheSnap.exists()) {
        const data = cacheSnap.data();
        const now = new Date().getTime();
        const lastUpdatedTime = data.lastUpdatedTimestamp || 0;

        if (
          now - lastUpdatedTime < 3600 * 1000 &&
          data.latitude === config.latitude &&
          data.longitude === config.longitude
        ) {
          setTempC(data.tempC);
          setSnowDepthCm(data.snowDepthCm);
          setNewSnow24h(data.newSnow24h);
          setWindKmh(data.windKmh);
          setWeatherCode(typeof data.weatherCode === 'number' ? data.weatherCode : 0);
          setOpenLifts(data.openLifts);
          setLastUpdated(
            new Date(lastUpdatedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          );
          logger.debug('Weather data loaded from Firestore cache.');
          setIsResortLoading(false);
          return;
        }
      }

      logger.debug(
        `Fetching fresh weather data for Lat: ${config.latitude}, Lon: ${config.longitude} from API...`
      );

      const forecastApiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${config.latitude}&longitude=${config.longitude}&current=temperature_2m,wind_speed_10m,weather_code&hourly=snow_depth&daily=snowfall_sum&timezone=auto`;

      const response = await fetch(forecastApiUrl);

      if (!response.ok) {
        logger.error('Forecast API Error:', await response.text());
        throw new Error('Failed to fetch weather data');
      }

      const forecastData = await response.json();

      const newTempC =
        forecastData.current?.temperature_2m !== undefined
          ? Math.round(forecastData.current.temperature_2m)
          : -5;
      const newWindKmh =
        forecastData.current?.wind_speed_10m !== undefined
          ? Math.round(forecastData.current.wind_speed_10m)
          : 15;
      const newWeatherCode =
        forecastData.current?.weather_code !== undefined ? forecastData.current.weather_code : 0;
      const newSnowfall24h =
        forecastData.daily?.snowfall_sum?.[0] !== undefined
          ? Math.round(forecastData.daily.snowfall_sum[0])
          : 12;

      const firstHourlySnowDepth = forecastData.hourly?.snow_depth?.[0];
      const newSnowDepthCm =
        firstHourlySnowDepth !== undefined && firstHourlySnowDepth !== null
          ? Math.round(firstHourlySnowDepth * 100)
          : 175;

      const baseOpenLifts = newWindKmh > 40 ? 8 : 13;
      const newOpenLifts = baseOpenLifts - Math.floor(Math.random() * 3);
      const updatedTimestamp = new Date();

      setTempC(newTempC);
      setWindKmh(newWindKmh);
      setWeatherCode(newWeatherCode);
      setSnowDepthCm(newSnowDepthCm);
      setNewSnow24h(newSnowfall24h);
      setOpenLifts(newOpenLifts);
      setLastUpdated(
        updatedTimestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );

      const dataToCache = {
        tempC: newTempC,
        windKmh: newWindKmh,
        weatherCode: newWeatherCode,
        snowDepthCm: newSnowDepthCm,
        newSnow24h: newSnowfall24h,
        openLifts: newOpenLifts,
        lastUpdatedTimestamp: updatedTimestamp.getTime(),
        latitude: config.latitude,
        longitude: config.longitude,
      };

      try {
        await setDoc(cacheRef, dataToCache);
        logger.debug('Weather data cached to Firestore.');
      } catch (cacheError) {
        logger.warn('Weather cache update skipped:', cacheError);
      }
    } catch (error) {
      logger.error('Error fetching resort stats:', error);
      setTempC(-5);
      setSnowDepthCm(175);
      setNewSnow24h(12);
      setWindKmh(15);
      setWeatherCode(0);
      setOpenLifts(12);
    } finally {
      setIsResortLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResortStats(resortConfig);
  }, [resortConfig, fetchResortStats]);

  return {
    resortConfig,
    tempC,
    snowDepthCm,
    newSnow24h,
    windKmh,
    weatherCode,
    openLifts,
    isFahrenheit,
    setIsFahrenheit,
    isResortLoading,
    lastUpdated,
    handleRefreshResortStats: () => fetchResortStats(resortConfig),
  };
};
