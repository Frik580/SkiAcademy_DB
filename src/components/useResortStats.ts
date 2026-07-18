import { useState } from 'react';

export const useResortStats = () => {
  const [tempC, setTempC] = useState<number>(-5);
  const [snowDepthCm, setSnowDepthCm] = useState<number>(185);
  const [newSnow24h, setNewSnow24h] = useState<number>(25);
  const [windKmh, setWindKmh] = useState<number>(14);
  const [openLifts, setOpenLifts] = useState<number>(12);
  const [isFahrenheit, setIsFahrenheit] = useState<boolean>(false);
  const [isResortLoading, setIsResortLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

  const handleRefreshResortStats = () => {
    setIsResortLoading(true);
    setTimeout(() => {
      setTempC((prev) => Math.max(-12, Math.min(2, prev + (Math.random() > 0.5 ? 1 : -1))));
      setSnowDepthCm((prev) => prev + Math.floor(Math.random() * 3));
      setNewSnow24h((prev) => Math.max(0, prev + Math.floor(Math.random() * 5 - 2)));
      setWindKmh((prev) => Math.max(5, Math.min(45, prev + Math.floor(Math.random() * 10 - 5))));
      setOpenLifts((prev) => Math.max(10, Math.min(14, prev + (Math.random() > 0.7 ? 1 : Math.random() > 0.7 ? -1 : 0))));
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setIsResortLoading(false);
    }, 1000);
  };

  return {
    tempC, snowDepthCm, newSnow24h, windKmh, openLifts,
    isFahrenheit, setIsFahrenheit,
    isResortLoading, lastUpdated,
    handleRefreshResortStats
  };
};