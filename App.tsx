import React, { useState, useEffect } from 'react';
import { INITIAL_VILLAGES } from './constants';
import { Village, CaseReport, HealthStatus, AIAnalysisResult, OutbreakCluster, Comment } from './types';
import { analyzeVillageHealth, analyzeClusters } from './services/geminiService';
import VillageMap from './components/VillageMap';
import AshaForm from './components/AshaForm';
import { Activity, Map as MapIcon, ShieldAlert, UserCheck, AlertTriangle, ArrowRight, Search, Database, LandPlot, Stethoscope, MessageSquare, Send, Loader2, ClipboardList, Lightbulb, X } from 'lucide-react';

// Main App Component
const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'asha' | 'gov'>('gov');
  
  // Initialize villages from LocalStorage or use Constants
  const [villages, setVillages] = useState<Village[]>(() => {
    try {
      const saved = localStorage.getItem('healthguard_villages');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Migration: Ensure comments array exists on loaded data from older versions
        return parsed.map((v: any) => ({ ...v, comments: v.comments || [] }));
      }
    } catch (e) {
      console.error("Failed to load from local storage", e);
    }
    return INITIAL_VILLAGES;
  });

  const [clusters, setClusters] = useState<OutbreakCluster[]>([]);
  const [selectedVillageId, setSelectedVillageId] = useState<string | undefined>(undefined);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [commentText, setCommentText] = useState('');

  // Search States
  const [flyToLocation, setFlyToLocation] = useState<{lat: number, lng: number} | null>(null);
  const [searchedLocation, setSearchedLocation] = useState<{name: string, lat: number, lng: number} | null>(null);
  const [isGlobalSearching, setIsGlobalSearching] = useState(false);

  // Persist villages to LocalStorage whenever they change
  useEffect(() => {
    localStorage.setItem('healthguard_villages', JSON.stringify(villages));
    // Re-run cluster analysis when villages change
    if (villages.length > 0) {
      runClusterAnalysis(villages);
    }
  }, [villages]);

  const runClusterAnalysis = async (currentVillages: Village[]) => {
    const detectedClusters = await analyzeClusters(currentVillages);
    setClusters(detectedClusters);
  };

  // Statistics
  const totalCases = villages.reduce((acc, v) => acc + v.activeCases, 0);
  const redZones = villages.filter(v => v.status === HealthStatus.RED).length;
  const yellowZones = villages.filter(v => v.status === HealthStatus.YELLOW).length;

  // Handle Search (Local + Global)
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    // Reset selection logic
    setSelectedVillageId(undefined);
    setSearchedLocation(null);

    // 1. Try finding in local database
    const found = villages.find(v => v.name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    if (found) {
      setSelectedVillageId(found.id);
      setFlyToLocation(null); // Reset fly to since selection handles it
    } else {
      // 2. If not found, search OSM globally
      setIsGlobalSearching(true);
      try {
        const query = `${searchQuery}, India`;
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`, {
            headers: {
                'Accept-Language': 'en-US,en;q=0.9',
            }
        });
        
        if (!response.ok) {
            throw new Error(`Nominatim API Error: ${response.status}`);
        }

        const data = await response.json();
        
        if (Array.isArray(data) && data.length > 0) {
          const { lat, lon, display_name } = data[0];
          const newLoc = { lat: parseFloat(lat), lng: parseFloat(lon) };
          
          setFlyToLocation(newLoc);
          setSearchedLocation({
             name: display_name,
             lat: newLoc.lat,
             lng: newLoc.lng
          });
          // Remove alert, UI will show details in sidebar
        } else {
          alert("Location not found in database or on global map.");
        }
      } catch (err) {
        console.error("Global search failed", err);
        alert("Search Service Error. Please check your internet connection.");
      } finally {
        setIsGlobalSearching(false);
      }
    }
  };

  const clearSearch = () => {
      setSearchedLocation(null);
      setFlyToLocation(null);
      setSearchQuery('');
  };

  const handleReportSubmit = async (report: CaseReport, villageName: string) => {
    setIsAnalyzing(true);
    
    // Find village or create a temporary structure for analysis if new
    let village = villages.find(v => v.id === report.villageId);
    let isNewVillage = false;

    if (!village) {
      isNewVillage = true;
      // Parse coordinates from report (expected format "lat, lng")
      let coords = { lat: 20.5937, lng: 78.9629 }; // Default India center
      if (report.workerLocation && report.workerLocation.includes(',')) {
        const [lat, lng] = report.workerLocation.split(',').map(s => parseFloat(s.trim()));
        if (!isNaN(lat) && !isNaN(lng)) {
          coords = { lat, lng };
        }
      }

      village = {
        id: report.villageId,
        name: villageName,
        district: 'Detected via GPS',
        coordinates: coords,
        population: 1000, // Default estimate
        activeCases: 0,
        status: HealthStatus.GREEN,
        lastReported: new Date().toISOString(),
        dominantSymptoms: [],
        comments: []
      };
    }
    
    // AI Analysis
    const analysis = await analyzeVillageHealth(village, report);
    
    // Update Village State with new report and Analysis Result
    const updatedVillage: Village = {
      ...village,
      activeCases: village.activeCases + report.affectedCount,
      status: analysis.riskLevel,
      lastReported: new Date().toISOString(),
      lastAshaWorker: report.workerName,
      dominantSymptoms: Array.from(new Set([...village.dominantSymptoms, report.symptoms.split(',')[0] || 'Unknown'])),
      comments: village.comments || [],
      lastAnalysis: analysis // STORE analysis directly in village
    };

    if (isNewVillage) {
      setVillages(prev => [...prev, updatedVillage]);
    } else {
      setVillages(prev => prev.map(v => v.id === updatedVillage.id ? updatedVillage : v));
    }

    setIsAnalyzing(false);
    
    // Auto-switch to Government Dashboard and select the village to show details
    setActiveTab('gov');
    setTimeout(() => {
        setSelectedVillageId(updatedVillage.id);
        setSearchedLocation(null);
        setFlyToLocation(null);
    }, 100);
  };

  const handleAddComment = (villageId: string) => {
    if (!commentText.trim()) return;
    
    const newComment: Comment = {
      id: crypto.randomUUID(),
      author: 'Public User',
      text: commentText,
      timestamp: new Date().toISOString()
    };

    setVillages(prev => prev.map(v => {
      if (v.id === villageId) {
        return {
          ...v,
          comments: [newComment, ...(v.comments || [])]
        };
      }
      return v;
    }));

    setCommentText('');
  };

  const selectedVillage = villages.find(v => v.id === selectedVillageId);

  return (
    <div className="min-h-screen flex flex-col font-sans bg-slate-50">
      {/* Header */}
      <header className="bg-indigo-900 text-white p-4 shadow-lg sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 p-2 rounded-lg">
              <Activity className="w-6 h-6 text-indigo-300" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">HealthGuard <span className="text-indigo-300 font-normal">AI</span></h1>
              <p className="text-xs text-indigo-200">Real-time Epidemic Monitoring System</p>
            </div>
          </div>
          
          <div className="flex gap-6 text-sm font-medium">
             <div className="flex flex-col items-center">
                <span className="text-2xl font-bold text-white leading-none">{totalCases}</span>
                <span className="text-indigo-300 text-[10px] uppercase">Active Cases</span>
             </div>
             <div className="w-px bg-indigo-700 h-8"></div>
             <div className="flex flex-col items-center">
                <span className="text-2xl font-bold text-red-400 leading-none">{redZones}</span>
                <span className="text-red-200 text-[10px] uppercase">Red Zones</span>
             </div>
             <div className="w-px bg-indigo-700 h-8"></div>
             <div className="flex flex-col items-center">
                <span className="text-2xl font-bold text-yellow-400 leading-none">{yellowZones}</span>
                <span className="text-yellow-200 text-[10px] uppercase">Warnings</span>
             </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-slate-200 shadow-sm sticky top-[72px] z-40">
        <div className="max-w-7xl mx-auto flex justify-center">
          <button
            onClick={() => setActiveTab('gov')}
            className={`flex-1 py-4 text-sm font-medium border-b-2 transition-colors flex justify-center items-center gap-2
              ${activeTab === 'gov' ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <ShieldAlert className="w-4 h-4" /> Government Dashboard
          </button>
          <button
            onClick={() => setActiveTab('asha')}
            className={`flex-1 py-4 text-sm font-medium border-b-2 transition-colors flex justify-center items-center gap-2
              ${activeTab === 'asha' ? 'border-blue-600 text-blue-700 bg-blue-50/50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <UserCheck className="w-4 h-4" /> ASHA Worker Portal
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 space-y-6">
        
        {activeTab === 'gov' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
            
            {/* Left Panel: Map & Search */}
            <div className="lg:col-span-2 space-y-4 flex flex-col h-full">
               {/* Search Bar */}
               <form onSubmit={handleSearch} className="flex gap-2 relative z-10">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Search village name or any location..."
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <button 
                    type="submit" 
                    disabled={isGlobalSearching}
                    className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-indigo-700 shadow-sm disabled:opacity-70 flex items-center gap-2"
                  >
                    {isGlobalSearching ? <Loader2 className="w-4 h-4 animate-spin"/> : <Search className="w-4 h-4" />}
                    Locate
                  </button>
               </form>

               {/* Map Container */}
               <div className="flex-grow min-h-[500px] rounded-xl overflow-hidden border border-slate-300 shadow-sm relative">
                  <VillageMap 
                    villages={villages} 
                    onSelectVillage={(v) => { setSelectedVillageId(v.id); setSearchedLocation(null); setFlyToLocation(null); }} 
                    selectedVillageId={selectedVillageId}
                    clusters={clusters}
                    flyToLocation={flyToLocation}
                  />
               </div>
            </div>

            {/* Right Panel: Details & Alerts */}
            <div className="space-y-6 h-full overflow-y-auto pr-1">
              
              {/* Clusters Alert Section */}
              {clusters.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm animate-pulse-slow">
                  <div className="flex items-center gap-2 text-red-800 font-bold mb-3">
                    <AlertTriangle className="w-5 h-5" />
                    <h3>Active Outbreak Clusters</h3>
                  </div>
                  <div className="space-y-3">
                    {clusters.map(cluster => (
                      <div key={cluster.id} className="bg-white p-3 rounded-lg border border-red-100 shadow-sm text-sm">
                        <div className="flex justify-between items-start mb-2">
                           <span className="font-semibold text-slate-700">Cluster: {cluster.villageIds.length} Villages</span>
                           <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-bold uppercase">{cluster.severity}</span>
                        </div>
                        <p className="text-slate-600 text-xs italic">
                           AI Plan: "{cluster.aiAdvice}"
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* DETAILS PANEL LOGIC */}
              {selectedVillage ? (
                // --- CASE 1: Village Selected ---
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 animate-in slide-in-from-right duration-300">
                  {/* Village Header */}
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-xl font-bold text-slate-800">{selectedVillage.name}</h2>
                      <p className="text-slate-500 text-sm flex items-center gap-1">
                        <MapIcon className="w-3 h-3" /> {selectedVillage.district}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-bold border ${
                      selectedVillage.status === HealthStatus.GREEN ? 'bg-green-50 text-green-700 border-green-200' :
                      selectedVillage.status === HealthStatus.YELLOW ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                      'bg-red-50 text-red-700 border-red-200'
                    }`}>
                      {selectedVillage.status} Zone
                    </span>
                  </div>

                  {/* Key Stats */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                     <div className="bg-slate-50 p-3 rounded-lg">
                        <p className="text-slate-500 text-xs">Active Cases</p>
                        <p className="font-bold text-lg text-slate-800">{selectedVillage.activeCases}</p>
                     </div>
                     <div className="bg-slate-50 p-3 rounded-lg">
                        <p className="text-slate-500 text-xs">Population</p>
                        <p className="font-bold text-lg text-slate-800">{selectedVillage.population.toLocaleString()}</p>
                     </div>
                  </div>

                  {/* Survey Details */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                        <ClipboardList className="w-3 h-3" /> Survey Details
                    </h4>
                    <div className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <p><span className="font-medium">Reporter:</span> {selectedVillage.lastAshaWorker || 'Unknown'}</p>
                      <p><span className="font-medium">Symptoms:</span> {selectedVillage.dominantSymptoms.length > 0 ? selectedVillage.dominantSymptoms.join(', ') : 'None reported'}</p>
                      <p className="text-xs text-slate-400 mt-2">{new Date(selectedVillage.lastReported).toLocaleString()}</p>
                    </div>
                  </div>

                  {/* Latest AI Analysis (Visible if available) */}
                  {selectedVillage.lastAnalysis && (
                    <div className="space-y-3 bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                        <div className="flex justify-between items-center">
                            <h4 className="text-xs font-bold text-indigo-800 uppercase tracking-wide flex items-center gap-1">
                                <Database className="w-3 h-3" /> AI Prediction
                            </h4>
                            <span className="text-xs font-bold text-indigo-600">{selectedVillage.lastAnalysis.predictedOutbreakChance}% Outbreak Prob.</span>
                        </div>
                        
                        <div className="bg-white p-3 rounded-lg border border-indigo-50 shadow-sm">
                             <p className="text-sm font-bold text-indigo-900 mb-1 flex items-center gap-1">
                                <Stethoscope className="w-3 h-3" /> {selectedVillage.lastAnalysis.possibleDiagnosis}
                             </p>
                             <p className="text-xs text-slate-600 leading-snug">
                                {selectedVillage.lastAnalysis.reasoning}
                             </p>
                        </div>

                        <div>
                            <h5 className="text-xs font-bold text-indigo-800 mb-2 flex items-center gap-1">
                                <Lightbulb className="w-3 h-3" /> Recommended Actions
                            </h5>
                            <ul className="space-y-1">
                                {selectedVillage.lastAnalysis.recommendedActions.slice(0, 3).map((action, i) => (
                                    <li key={i} className="text-xs flex gap-2 text-indigo-900 bg-white/50 p-1.5 rounded">
                                        <span className="font-bold">•</span> {action}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                  )}

                  {/* Comments Section */}
                  <div className="pt-4 border-t border-slate-100">
                    <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                       <MessageSquare className="w-4 h-4" /> Public Comments
                    </h4>
                    
                    <div className="space-y-3 mb-4 max-h-40 overflow-y-auto">
                      {selectedVillage.comments && selectedVillage.comments.length > 0 ? (
                        selectedVillage.comments.map(c => (
                          <div key={c.id} className="text-xs bg-slate-50 p-2 rounded border border-slate-100">
                            <p className="text-slate-700">{c.text}</p>
                            <p className="text-[10px] text-slate-400 mt-1">{new Date(c.timestamp).toLocaleDateString()} • {c.author}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-400 italic">No comments yet.</p>
                      )}
                    </div>

                    <div className="flex gap-2">
                       <input 
                         type="text" 
                         placeholder="Add a comment..."
                         className="flex-1 text-xs p-2 border border-slate-300 rounded focus:outline-none focus:border-indigo-500"
                         value={commentText}
                         onChange={(e) => setCommentText(e.target.value)}
                       />
                       <button 
                         onClick={() => handleAddComment(selectedVillage.id)}
                         className="bg-indigo-600 text-white p-2 rounded hover:bg-indigo-700"
                       >
                         <Send className="w-3 h-3" />
                       </button>
                    </div>
                  </div>

                </div>
              ) : searchedLocation ? (
                 // --- CASE 2: Arbitrary Location Found ---
                 <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 animate-in slide-in-from-right duration-300">
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">Location Found</h2>
                            <p className="text-slate-500 text-sm flex items-center gap-1">
                                <MapIcon className="w-3 h-3" /> Custom Map Search
                            </p>
                        </div>
                        <button onClick={clearSearch} className="p-1 hover:bg-slate-100 rounded-full transition-colors">
                           <X className="w-5 h-5 text-slate-400" />
                        </button>
                    </div>
                    
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                        <p className="font-medium text-slate-800 text-sm leading-relaxed">{searchedLocation.name}</p>
                        <div className="mt-3 flex gap-4 text-xs text-slate-500 font-mono border-t border-slate-200 pt-2">
                            <span>Lat: {searchedLocation.lat.toFixed(5)}</span>
                            <span>Lng: {searchedLocation.lng.toFixed(5)}</span>
                        </div>
                    </div>

                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                        <h4 className="text-sm font-bold text-blue-900 mb-2 flex items-center gap-2">
                           <Lightbulb className="w-4 h-4" /> Monitoring Status
                        </h4>
                        <p className="text-xs text-blue-800 leading-relaxed mb-2">
                            This location is not currently in the active monitoring database. No ASHA reports or AI predictions are available for this specific coordinate yet.
                        </p>
                        <p className="text-xs text-blue-800 leading-relaxed">
                            <strong>To Activate:</strong> An ASHA worker must submit a field report from this location to generate health analytics and outbreak predictions.
                        </p>
                    </div>
                 </div>
              ) : (
                // --- CASE 3: Empty State ---
                <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-sm flex flex-col items-center justify-center text-center h-64 text-slate-400">
                   <LandPlot className="w-12 h-12 mb-2 opacity-20" />
                   <p>Select a village on the map or use search to view details</p>
                </div>
              )}

              {/* Global Legend/Info */}
              <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                <h4 className="text-sm font-bold text-indigo-900 mb-2">AI Surveillance Active</h4>
                <p className="text-xs text-indigo-700 leading-relaxed">
                  The system is continuously analyzing reports. Red zones indicate high probability of outbreaks based on symptoms and sanitation levels.
                </p>
              </div>

            </div>
          </div>
        )}

        {activeTab === 'asha' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            <div className="order-2 lg:order-1">
               <AshaForm 
                  villages={villages} 
                  onSubmitReport={handleReportSubmit} 
                  isSubmitting={isAnalyzing} 
               />
            </div>
            
            <div className="order-1 lg:order-2 space-y-6">
              <div className="bg-gradient-to-br from-indigo-600 to-blue-700 text-white p-6 rounded-2xl shadow-lg">
                <h3 className="text-lg font-bold mb-2">Instructions for ASHA Workers</h3>
                <ul className="space-y-3 text-sm text-indigo-100">
                  <li className="flex gap-2 items-start"><ArrowRight className="w-4 h-4 mt-0.5 shrink-0"/> Ensure GPS location is accurate when reporting new cases.</li>
                  <li className="flex gap-2 items-start"><ArrowRight className="w-4 h-4 mt-0.5 shrink-0"/> Report "Worst" sanitation immediately if drainage is blocked.</li>
                  <li className="flex gap-2 items-start"><ArrowRight className="w-4 h-4 mt-0.5 shrink-0"/> If disease is unknown, list all symptoms clearly for AI diagnosis.</li>
                  <li className="flex gap-2 items-start"><ArrowRight className="w-4 h-4 mt-0.5 shrink-0 text-yellow-300"/> <b>Note:</b> After submitting, you will be redirected to the Gov Portal to view the registered Action Plan.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;