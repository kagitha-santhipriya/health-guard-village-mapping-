
export enum HealthStatus {
  GREEN = 'Green', // Safe
  YELLOW = 'Yellow', // Moderate Risk
  RED = 'Red', // Outbreak/Critical
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Comment {
  id: string;
  author: string;
  text: string;
  timestamp: string;
}

export interface AIAnalysisResult {
  riskLevel: HealthStatus;
  reasoning: string;
  recommendedActions: string[];
  predictedOutbreakChance: number; // 0-100
  possibleDiagnosis: string; // AI predicted disease based on symptoms
}

export interface Village {
  id: string;
  name: string;
  district: string; // Added for context
  coordinates: Coordinates;
  population: number;
  activeCases: number;
  status: HealthStatus;
  lastReported: string; // ISO date string
  lastAshaWorker?: string; // To track who reported
  dominantSymptoms: string[];
  comments: Comment[];
  lastAnalysis?: AIAnalysisResult; // Persist the latest AI findings
}

export interface CaseReport {
  id: string;
  villageId: string;
  // ASHA Worker Details
  workerName: string;
  workerLocation: string;
  
  // Environmental Details
  sanitationStatus: 'Good' | 'Ok' | 'Worst';

  // Health Details
  diseaseType: string;
  symptoms: string;
  affectedCount: number;
  timestamp: string;
  notes: string;
}

export interface OutbreakCluster {
  id: string;
  villageIds: string[];
  center: Coordinates;
  radius: number; // in meters
  severity: HealthStatus;
  aiAdvice: string; // Coordinated action plan
}
