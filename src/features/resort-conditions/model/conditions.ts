export interface ResortLocation {
  latitude: number;
  longitude: number;
}

export interface ResortConditions {
  temperatureC: number | null;
  apparentTemperatureC: number | null;
  weatherCode: number | null;
  windKmh: number | null;
  windGustKmh: number | null;
  visibilityM: number | null;
  snowDepthCm: number | null;
  updatedAt: string | null;
  // Weather forecasts do not provide resort operations. Supply these only from a real provider.
  liftsOpen: number | null;
  liftsTotal: number | null;
  trailsOpen: number | null;
}

export interface ResortConditionsState {
  status: 'loading' | 'ready' | 'error';
  data: ResortConditions | null;
}

export type TemperatureUnit = 'celsius' | 'fahrenheit';
