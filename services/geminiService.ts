
import { GoogleGenAI, Type } from "@google/genai";
import { Village, HealthStatus, AIAnalysisResult, CaseReport, OutbreakCluster, Coordinates } from '../types';

// Initialize Gemini Client
const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

const model = "gemini-2.5-flash";

// --- Helper: Calculate Haversine Distance (in meters) ---
const getDistance = (c1: Coordinates, c2: Coordinates): number => {
  const R = 6371e3; // Earth radius in meters
  const q1 = c1.lat * Math.PI / 180;
  const q2 = c2.lat * Math.PI / 180;
  const dq = (c2.lat - c1.lat) * Math.PI / 180;
  const dl = (c2.lng - c1.lng) * Math.PI / 180;

  const a = Math.sin(dq/2) * Math.sin(dq/2) +
            Math.cos(q1) * Math.cos(q2) *
            Math.sin(dl/2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
};

export const analyzeVillageHealth = async (
  village: Village,
  newReport: CaseReport
): Promise<AIAnalysisResult> => {
  try {
    const prompt = `
      Analyze the health risk for a village based on a new field report from an ASHA worker.
      
      Village Context:
      - Name: ${village.name}
      - Population: ${village.population}
      - Current Active Cases (before this report): ${village.activeCases}
      - Previous Status: ${village.status}
      
      New Field Report:
      - Reported By: ${newReport.workerName}
      - Specific Location: ${newReport.workerLocation} (GPS Verified)
      - Sanitation/Garbage Condition: ${newReport.sanitationStatus} (CRITICAL FACTOR)
      - Disease/Suspected: ${newReport.diseaseType}
      - Number of New People Affected: ${newReport.affectedCount}
      - Symptoms: ${newReport.symptoms}
      - Notes: ${newReport.notes}

      Task:
      1. Determine the new Risk Level (Green, Yellow, Red) based on infection rate, disease type, and ENVIRONMENTAL SANITATION.
      2. PREDICT THE DISEASE: Use the 'Symptoms' provided to identify the most likely medical condition. If the reported disease is 'Unknown', this is crucial. If a disease is reported, verify if it matches the symptoms.
      
      CRITICAL RULES:
      1. If Sanitation/Garbage Condition is "Worst", the Risk Level MUST be at least Yellow. If the disease is vector-borne (Dengue, Malaria, etc.) AND Sanitation is "Worst", strongly consider Red.
      2. Predict the probability (0-100) of an outbreak.
      3. Provide reasoning that explicitly mentions the sanitation condition if it is a contributing factor.
      4. Provide 3 concise government interventions.

      Definitions:
      - Green: Safe, sporadic minor cases, good hygiene.
      - Yellow: Moderate risk, poor sanitation or cluster of cases.
      - Red: Critical, outbreak potential, high spread, hazardous sanitation.
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            riskLevel: { type: Type.STRING, enum: [HealthStatus.GREEN, HealthStatus.YELLOW, HealthStatus.RED] },
            reasoning: { type: Type.STRING },
            predictedOutbreakChance: { type: Type.NUMBER },
            possibleDiagnosis: { type: Type.STRING, description: "The likely disease identified from symptoms (e.g., 'Likely Malaria', 'Viral Fever')." },
            recommendedActions: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["riskLevel", "reasoning", "predictedOutbreakChance", "possibleDiagnosis", "recommendedActions"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    return JSON.parse(text) as AIAnalysisResult;

  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    return {
      riskLevel: HealthStatus.YELLOW,
      reasoning: "AI Analysis unavailable. Defaulting to moderate caution due to new report.",
      predictedOutbreakChance: 50,
      possibleDiagnosis: "Analysis Failed - Refer to Doctor",
      recommendedActions: ["Monitor situation closely", "Dispatch field team for manual verification"]
    };
  }
};

// --- Clustering Logic ---

export const analyzeClusters = async (villages: Village[]): Promise<OutbreakCluster[]> => {
  const DISTANCE_THRESHOLD = 15000; // 15 km threshold for clustering
  const clusters: OutbreakCluster[] = [];
  const processed = new Set<string>();

  // Only look at Unsafe villages (Red or Yellow)
  const unsafeVillages = villages.filter(v => v.status !== HealthStatus.GREEN);

  for (let i = 0; i < unsafeVillages.length; i++) {
    const v1 = unsafeVillages[i];
    if (processed.has(v1.id)) continue;

    const currentCluster: Village[] = [v1];
    processed.add(v1.id);

    // Find neighbors
    for (let j = i + 1; j < unsafeVillages.length; j++) {
      const v2 = unsafeVillages[j];
      if (processed.has(v2.id)) continue;

      const d = getDistance(v1.coordinates, v2.coordinates);
      if (d <= DISTANCE_THRESHOLD) {
        currentCluster.push(v2);
        processed.add(v2.id);
      }
    }

    // Only create a cluster if there are 2 or more villages
    if (currentCluster.length >= 2) {
      // Calculate Center
      const latSum = currentCluster.reduce((sum, v) => sum + v.coordinates.lat, 0);
      const lngSum = currentCluster.reduce((sum, v) => sum + v.coordinates.lng, 0);
      const center = {
        lat: latSum / currentCluster.length,
        lng: lngSum / currentCluster.length
      };

      // Determine Severity (Red if any is Red)
      const severity = currentCluster.some(v => v.status === HealthStatus.RED) 
        ? HealthStatus.RED 
        : HealthStatus.YELLOW;

      // Ask AI for a coordinated plan
      let aiAdvice = "Cluster detected. Coordinate resources.";
      try {
        const clusterPrompt = `
          A disease cluster has been detected involving these villages: ${currentCluster.map(v => v.name).join(', ')}.
          
          Details:
          ${currentCluster.map(v => `- ${v.name}: ${v.activeCases} cases, Status: ${v.status}, Symptoms: ${v.dominantSymptoms.join(', ')}`).join('\n')}
          
          This is a ${severity} ALERT. The villages are geographically close (<15km).
          
          Generate a short, strategic Government Action Plan (max 2 sentences) to handle this regional outbreak effectively. Focus on resource allocation and containment.
        `;

        const response = await ai.models.generateContent({
          model,
          contents: clusterPrompt,
        });
        if (response.text) aiAdvice = response.text;
      } catch (e) {
        console.error("Cluster AI failed", e);
      }

      clusters.push({
        id: `cluster-${Date.now()}-${i}`,
        villageIds: currentCluster.map(v => v.id),
        center,
        radius: DISTANCE_THRESHOLD / 2, // rough visual radius
        severity,
        aiAdvice
      });
    }
  }

  return clusters;
};
