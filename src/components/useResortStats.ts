import { useState, useEffect, useCallback } from 'react';
import { db, doc, getDoc, setDoc } from '../lib/firebase';

export const useResortStats = () => {
  const [tempC, setTempC] = useState(0);
  const [snowDepthCm, setSnowDepthCm] = useState(0);
  const [newSnow24h, setNewSnow24h] = useState(0);
  const [windKmh, setWindKmh] = useState(0);
  const [openLifts, setOpenLifts] = useState(0);
  const [isFahrenheit, setIsFahrenheit] = useState(false);
  const [isResortLoading, setIsResortLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('--:--');

  const fetchResortStats = useCallback(async () => {
    setIsResortLoading(true);
    const resortId = 'chamonix'; // Идентификатор курорта для кеширования
    const cacheRef = doc(db, 'resort_data', resortId);

    try {
      // 1. Попытка прочитать из кеша Firestore
      const cacheSnap = await getDoc(cacheRef);
      if (cacheSnap.exists()) {
        const data = cacheSnap.data();
        const now = new Date().getTime();
        const lastUpdatedTime = data.lastUpdatedTimestamp || 0;

        // Использовать кеш, если он не старше 1 часа (3600 * 1000 мс)
        if (now - lastUpdatedTime < 3600 * 1000) {
          setTempC(data.tempC);
          setSnowDepthCm(data.snowDepthCm);
          setNewSnow24h(data.newSnow24h);
          setWindKmh(data.windKmh);
          setOpenLifts(data.openLifts);
          setLastUpdated(new Date(lastUpdatedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));          
          console.log("Weather data loaded from Firestore cache.");
          setIsResortLoading(false); // Завершаем загрузку здесь
          return;
        }
      }

      // 2. Если кеш устарел или отсутствует, делаем запрос к API Open-Meteo
      console.log("Fetching fresh weather data from API...");


      // Координаты для Шамони, Франция (как пример)
      const lat = 45.9237;
      const lon = 6.8694;

      // Получаем все данные из Forecast API (текущая погода, снежный покров hourly и свежий снег daily)
      const forecastApiUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m&hourly=snow_depth&daily=snowfall_sum&timezone=auto`;

      const response = await fetch(forecastApiUrl);

      if (!response.ok) {
        console.error("Forecast API Error:", await response.text());
        throw new Error('Failed to fetch weather data');
      }

      const forecastData = await response.json();

      // --- Обработка и установка состояний ---
      const newTempC = forecastData.current?.temperature_2m !== undefined ? Math.round(forecastData.current.temperature_2m) : -5;
      const newWindKmh = forecastData.current?.wind_speed_10m !== undefined ? Math.round(forecastData.current.wind_speed_10m) : 15;
      const newSnowfall24h = forecastData.daily?.snowfall_sum?.[0] !== undefined ? Math.round(forecastData.daily.snowfall_sum[0]) : 12;

      // Глубина снега в метрах, переводим в сантиметры. Берём первое значение из почасового прогноза.
      const firstHourlySnowDepth = forecastData.hourly?.snow_depth?.[0];
      const newSnowDepthCm = firstHourlySnowDepth !== undefined && firstHourlySnowDepth !== null
        ? Math.round(firstHourlySnowDepth * 100)
        : 175; // Запасной вариант по умолчанию

      // Улучшенная симуляция открытых подъемников (зависит от ветра)
      const baseOpenLifts = newWindKmh > 40 ? 8 : 13;
      const newOpenLifts = baseOpenLifts - Math.floor(Math.random() * 3);
      const updatedTimestamp = new Date();

      // Температура и ветер из Forecast API
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
        openLifts: newOpenLifts, // Здесь можно будет добавить реальные данные с сайта курорта
        lastUpdatedTimestamp: updatedTimestamp.getTime(),
      };
      await setDoc(cacheRef, dataToCache);
      console.log("Weather data cached to Firestore.");
    } catch (error) {
      console.error("Error fetching resort stats:", error);
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

  useEffect(() => {
    fetchResortStats();
  }, [fetchResortStats]);

  return {
    tempC, snowDepthCm, newSnow24h, windKmh, openLifts,
    isFahrenheit, setIsFahrenheit,
    isResortLoading, lastUpdated,
    handleRefreshResortStats: fetchResortStats
  };
};