import { Village, HealthStatus } from './types';

// Sample data: 1 in Krishna District, 4 in Vizianagaram District (Andhra Pradesh)
export const INITIAL_VILLAGES: Village[] = [
  // Krishna District
  {
    id: 'v1',
    name: 'Pedana',
    district: 'Krishna',
    coordinates: { lat: 16.2556, lng: 81.1667 },
    population: 3100,
    activeCases: 2,
    status: HealthStatus.GREEN,
    lastReported: new Date().toISOString(),
    dominantSymptoms: ['Mild Fever'],
    comments: []
  },
  // Vizianagaram District
  {
    id: 'v2',
    name: 'Bobbili',
    district: 'Vizianagaram',
    coordinates: { lat: 18.5667, lng: 83.3667 },
    population: 5400,
    activeCases: 15,
    status: HealthStatus.YELLOW,
    lastReported: new Date(Date.now() - 86400000).toISOString(),
    dominantSymptoms: ['Fever', 'Body Pain'],
    comments: []
  },
  {
    id: 'v3',
    name: 'Cheepurupalli',
    district: 'Vizianagaram',
    coordinates: { lat: 18.3000, lng: 83.5667 },
    population: 4200,
    activeCases: 45,
    status: HealthStatus.RED,
    lastReported: new Date().toISOString(),
    dominantSymptoms: ['High Fever', 'Vomiting', 'Rash'],
    comments: []
  },
  {
    id: 'v4',
    name: 'Salur',
    district: 'Vizianagaram',
    coordinates: { lat: 18.5333, lng: 83.2167 },
    population: 3800,
    activeCases: 5,
    status: HealthStatus.GREEN,
    lastReported: new Date(Date.now() - 172800000).toISOString(),
    dominantSymptoms: [],
    comments: []
  },
  {
    id: 'v5',
    name: 'Gajapathinagaram',
    district: 'Vizianagaram',
    coordinates: { lat: 18.2833, lng: 83.3333 },
    population: 2900,
    activeCases: 8,
    status: HealthStatus.YELLOW,
    lastReported: new Date().toISOString(),
    dominantSymptoms: ['Cough', 'Fever'],
    comments: []
  }
];

export const DISEASES = [
  "Dengue",
  "Malaria",
  "Cholera",
  "Typhoid",
  "Viral Fever",
  "COVID-19",
  "Unknown"
];