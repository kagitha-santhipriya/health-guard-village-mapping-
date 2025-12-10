
import React, { useState, useEffect } from 'react';
import { INITIAL_VILLAGES } from './constants';
import { Village, CaseReport, HealthStatus, AIAnalysisResult, OutbreakCluster } from './types';
import { analyzeVillageHealth, analyzeClusters } from './services/geminiService';
import VillageMap from './components/VillageMap';
import AshaForm from './components/AshaForm';
import { Activity, Map as MapIcon, ShieldAlert, UserCheck, AlertTriangle, ArrowRight, Search, Database, Radius, LandPlot, Stethoscope } from 'lucide-react';

// Main App Component
const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'asha' | 'gov'>('gov');
  
  // Initialize villages from LocalStorage or use Constants
  const [villages, setVillages] = useState<Village[]>(() => {
    try {
      const saved = localStorage.getItem('healthguard_villages');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to load from local storage", e);
    }
    return INITIAL_VILLAGES;
  });

  const [clusters, setClusters] = useState<OutbreakCluster[]>([]);
  const [selectedVillageId, setSelectedVillageId] = useState<string | undefined>(undefined);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [latestAnalysis, setLatestAnalysis] = useState<{ villageName: string; result: AIAnalysisResult } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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

  const handleReportSubmit = async (report: CaseReport) => {
    setIsAnalyzing(true);
    
    // Find village
    const targetVillageIndex = villages.findIndex(v => v.id === report.villageId);
    if (targetVillageIndex === -1) {
      setIsAnalyzing(false);
      return;
    }

    const currentVillage = villages[targetVillageIndex];

    // Call Gemini AI
    const analysis = await analyzeVillageHealth(currentVillage, report);

    // Update State
    const updatedVillages = [...villages];
    updatedVillages[targetVillageIndex] = {
      ...currentVillage,
      activeCases: currentVillage.activeCases + report.affectedCount,
      status: analysis.riskLevel,
      lastReported: new Date().toISOString(),
      lastAshaWorker: report.workerName, // Save the worker name
      dominantSymptoms: [...new Set([...currentVillage.dominantSymptoms, ...report.symptoms.split(',').map(s => s.trim())])].slice(0, 3)
    };

    setVillages(updatedVillages);
    setLatestAnalysis({
      villageName: currentVillage.name,
      result: analysis
    });
    
    // Switch to Gov view to see the update map and alert
    setActiveTab('gov');
    setSelectedVillageId(currentVillage.id);
    setIsAnalyzing(false);
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (query.trim() === '') return;

    // Find the first village that matches the query
    const match = villages.find(v => 
      v.name.toLowerCase().includes(query.toLowerCase())
    );

    if (match) {
      setSelectedVillageId(match.id);
    }
  };

  // Reset Data for Demo purposes
  const handleResetData = () => {
    if (confirm("Reset all data to initial demo state?")) {
      setVillages(INITIAL_VILLAGES);
      setClusters([]);
      localStorage.removeItem('healthguard_villages');
      window.location.reload();
    }
  };

  const selectedVillage = villages.find(v => v.id === selectedVillageId);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-transparent">
              HealthGuard
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab('asha')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'asha' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <UserCheck className="w-4 h-4" /> ASHA Portal
              </button>
              <button
                onClick={() => setActiveTab('gov')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeTab === 'gov' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <MapIcon className="w-4 h-4" /> Gov Dashboard
              </button>
            </div>
            <button onClick={handleResetData} className="text-xs text-slate-400 hover:text-red-500" title="Reset Demo Data">
              <Database className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {activeTab === 'asha' ? (
          <div className="max-w-xl mx-auto animate-in fade-in duration-300">
            <AshaForm 
              villages={villages} 
              onSubmitReport={handleReportSubmit} 
              isSubmitting={isAnalyzing} 
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full animate-in fade-in duration-300">
            
            {/* Left Column: Stats & Map */}
            <div className="lg:col-span-2 space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                  <p className="text-xs font-semibold text-slate-500 uppercase">Active Cases</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">{totalCases}</p>
                </div>
                <div className="bg-red-50 p-4 rounded-xl shadow-sm border border-red-100">
                  <p className="text-xs font-semibold text-red-600 uppercase">Critical Zones</p>
                  <p className="text-2xl font-bold text-red-700 mt-1">{redZones}</p>
                </div>
                <div className="bg-yellow-50 p-4 rounded-xl shadow-sm border border-yellow-100">
                  <p className="text-xs font-semibold text-yellow-600 uppercase">Watch List</p>
                  <p className="text-2xl font-bold text-yellow-700 mt-1">{yellowZones}</p>
                </div>
              </div>

              {/* Map Container */}
              <div className="space-y-4">
                 {/* Search Bar */}
                 <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input 
                      type="text" 
                      placeholder="Search village by name..." 
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                      value={searchQuery}
                      onChange={handleSearch}
                  />
                </div>

                {/* Map Component */}
                <div className="h-[500px]">
                   <VillageMap 
                      villages={villages} 
                      onSelectVillage={(v) => {
                        setSelectedVillageId(v.id);
                        setSearchQuery(''); // Optional: clear search on manual selection
                      }} 
                      selectedVillageId={selectedVillageId}
                      clusters={clusters}
                    />
                </div>
              </div>
            </div>

            {/* Right Column: AI Insights & Village Details */}
            <div className="lg:col-span-1 space-y-6">
              
              {/* CLUSTER ALERT */}
              {clusters.length > 0 && (
                <div className="bg-red-50 border border-red-200 p-4 rounded-xl shadow-sm animate-pulse">
                  <div className="flex items-center gap-2 mb-2 text-red-700 font-bold">
                    <LandPlot className="w-5 h-5" />
                    <h2>Regional Cluster Detected</h2>
                  </div>
                  <div className="space-y-3">
                    {clusters.map(cluster => (
                      <div key={cluster.id} className="bg-white p-3 rounded-lg border border-red-100 text-sm">
                        <p className="font-semibold text-slate-700 mb-1">
                          Affected: {cluster.villageIds.length} Villages
                        </p>
                        <p className="text-slate-600 text-xs italic">
                          "{cluster.aiAdvice}"
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Latest Alert Panel */}
              {latestAnalysis && (
                <div className="bg-gradient-to-br from-indigo-50 to-white p-6 rounded-xl shadow-md border border-indigo-100 animate-in slide-in-from-right duration-500">
                  <div className="flex items-center gap-2 mb-3">
                    <ShieldAlert className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-bold text-indigo-900">AI Risk Prediction</h3>
                  </div>
                  <div className="text-sm text-indigo-800 mb-4 bg-indigo-100/50 p-3 rounded-lg">
                    Latest analysis for <strong>{latestAnalysis.villageName}</strong>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">Predicted Risk:</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold 
                        ${latestAnalysis.result.riskLevel === 'Red' ? 'bg-red-100 text-red-700' : 
                          latestAnalysis.result.riskLevel === 'Yellow' ? 'bg-yellow-100 text-yellow-700' : 
                          'bg-green-100 text-green-700'}`}>
                        {latestAnalysis.result.riskLevel.toUpperCase()}
                      </span>
                    </div>
                    
                    {/* NEW: AI Diagnosis */}
                    <div className="flex flex-col gap-1 text-sm bg-white p-2 rounded border border-indigo-100">
                      <div className="flex items-center gap-1 text-indigo-600 font-semibold">
                        <Stethoscope className="w-3 h-3" />
                        <span>AI Suspected Diagnosis:</span>
                      </div>
                      <span className="font-bold text-slate-800 pl-4">{latestAnalysis.result.possibleDiagnosis}</span>
                    </div>

                    <div className="flex justify-between items-center text-sm mt-2">
                      <span className="text-slate-600">Outbreak Probability:</span>
                      <span className="font-mono font-bold">{latestAnalysis.result.predictedOutbreakChance}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${latestAnalysis.result.predictedOutbreakChance > 70 ? 'bg-red-500' : 'bg-blue-500'}`} 
                        style={{ width: `${latestAnalysis.result.predictedOutbreakChance}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-semibold text-slate-500 mb-2 uppercase">Recommended Actions</p>
                    <ul className="space-y-2">
                      {latestAnalysis.result.recommendedActions.map((action, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                          <ArrowRight className="w-3.5 h-3.5 text-indigo-400 mt-1 flex-shrink-0" />
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Village Details Card */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                  <h3 className="font-semibold text-slate-700">Village Details</h3>
                  {selectedVillage && (
                    <span className={`text-xs px-2 py-1 rounded-full border ${
                      selectedVillage.status === 'Red' ? 'bg-red-50 border-red-200 text-red-600' :
                      selectedVillage.status === 'Yellow' ? 'bg-yellow-50 border-yellow-200 text-yellow-600' :
                      'bg-green-50 border-green-200 text-green-600'
                    }`}>
                      {selectedVillage.status} Zone
                    </span>
                  )}
                </div>
                
                {selectedVillage ? (
                  <div className="p-4 space-y-4">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-800">{selectedVillage.name}</h2>
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <span>Pop: {selectedVillage.population}</span>
                        <span>•</span>
                        <span>Dist: {selectedVillage.district}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <p className="text-xs text-slate-500">Active Cases</p>
                        <p className="text-lg font-bold text-slate-800">{selectedVillage.activeCases}</p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <p className="text-xs text-slate-500">Last Reporter</p>
                        <p className="text-sm font-medium text-slate-800 truncate" title={selectedVillage.lastAshaWorker || 'System'}>
                          {selectedVillage.lastAshaWorker || 'System'}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-500 mb-2">DOMINANT SYMPTOMS</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedVillage.dominantSymptoms.length > 0 ? (
                          selectedVillage.dominantSymptoms.map((sym, i) => (
                            <span key={i} className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-md border border-slate-200">
                              {sym}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-slate-400 italic">None reported</span>
                        )}
                      </div>
                    </div>

                    {selectedVillage.status === HealthStatus.RED && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-bold text-red-700">Immediate Action Required</p>
                          <p className="text-xs text-red-600 mt-1">Dispatch emergency medical team. Quarantine protocols suggested.</p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-8 text-center text-slate-400">
                    <MapIcon className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    <p>Select a village on the map to view details</p>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
