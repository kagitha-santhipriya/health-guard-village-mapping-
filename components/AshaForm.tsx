
import React, { useState } from 'react';
import { Village, CaseReport } from '../types';
import { DISEASES } from '../constants';
import { Loader2, Send, User, MapPin, Trash2, LocateFixed } from 'lucide-react';

interface AshaFormProps {
  villages: Village[];
  onSubmitReport: (report: CaseReport, villageName: string) => Promise<void>;
  isSubmitting: boolean;
}

const AshaForm: React.FC<AshaFormProps> = ({ villages, onSubmitReport, isSubmitting }) => {
  // Worker Details
  const [workerName, setWorkerName] = useState('');
  const [selectedVillageName, setSelectedVillageName] = useState<string>('');
  const [workerLocation, setWorkerLocation] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  
  // Health Details
  const [diseaseType, setDiseaseType] = useState<string>(DISEASES[0]);
  const [affectedCount, setAffectedCount] = useState<number>(1);
  const [symptoms, setSymptoms] = useState<string>('');
  
  // Environmental Details
  const [sanitationStatus, setSanitationStatus] = useState<'Good' | 'Ok' | 'Worst'>('Good');
  const [notes, setNotes] = useState<string>('');

  const handleGetLocation = () => {
    setIsLocating(true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setWorkerLocation(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
          setIsLocating(false);
        },
        (error) => {
          alert("Unable to retrieve location. Please enter manually.");
          setIsLocating(false);
        }
      );
    } else {
      alert("Geolocation is not supported by this browser.");
      setIsLocating(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if village exists, or handle as new
    const matchedVillage = villages.find(v => v.name.toLowerCase() === selectedVillageName.toLowerCase());
    
    if (!workerName || !selectedVillageName) {
      alert("Please fill in all required fields.");
      return;
    }

    // Require valid GPS coordinates for new villages to place them on map
    if (!matchedVillage && (!workerLocation || !workerLocation.includes(','))) {
        alert("For a new village, please click 'Detect' to capture GPS coordinates so we can place it on the map.");
        return;
    }

    // Use matched ID or generate a new one for a new village
    const villageId = matchedVillage ? matchedVillage.id : `new-${Date.now()}`;

    const report: CaseReport = {
      id: crypto.randomUUID(),
      villageId: villageId,
      workerName,
      workerLocation,
      sanitationStatus,
      diseaseType,
      affectedCount,
      symptoms,
      notes,
      timestamp: new Date().toISOString()
    };

    // Pass the typed name explicitly to handle new creations
    onSubmitReport(report, selectedVillageName);
    
    // Reset report specific fields only
    setAffectedCount(1);
    setSymptoms('');
    setNotes('');
    setSanitationStatus('Good');
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-100 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6 border-b pb-4">
        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold shadow-sm">
          ASHA
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">ASHA Field Report</h2>
          <p className="text-sm text-slate-500">Log case details and environmental status</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Section 1: Worker Identity & Location */}
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4">
          <div className="flex items-center gap-2 mb-2 text-blue-700 font-semibold text-sm uppercase">
            <User className="w-4 h-4" /> Worker Details
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">ASHA Worker Name</label>
              <input
                type="text"
                placeholder="Enter your name"
                className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                value={workerName}
                onChange={(e) => setWorkerName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Allotted Village</label>
              <input 
                list="village-list" 
                className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Type village name..."
                value={selectedVillageName}
                onChange={(e) => setSelectedVillageName(e.target.value)}
                required
              />
              <datalist id="village-list">
                {villages.map(v => (
                  <option key={v.id} value={v.name}>{v.district}</option>
                ))}
              </datalist>
              <p className="text-[10px] text-slate-500 mt-1">
                * If you type a new village name, a new location marker will be created.
              </p>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Current Specific Location (GPS)</label>
            <div className="relative flex gap-2">
              <div className="relative flex-1">
                <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Click Detect for GPS or enter Lat, Lng"
                  className="w-full pl-9 p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
                  value={workerLocation}
                  onChange={(e) => setWorkerLocation(e.target.value)}
                  required
                />
              </div>
              <button
                type="button"
                onClick={handleGetLocation}
                className="bg-blue-600 text-white p-2.5 rounded-lg hover:bg-blue-700 transition flex items-center gap-1"
                title="Use Current Location"
              >
                {isLocating ? <Loader2 className="w-5 h-5 animate-spin"/> : <LocateFixed className="w-5 h-5" />}
                <span className="hidden sm:inline text-sm">Detect</span>
              </button>
            </div>
          </div>
        </div>

        {/* Section 2: Environmental Status */}
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4">
           <div className="flex items-center gap-2 mb-2 text-amber-700 font-semibold text-sm uppercase">
            <Trash2 className="w-4 h-4" /> Environmental Sanitation (Garbage Criteria)
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Sanitation Condition</label>
            <div className="grid grid-cols-3 gap-3">
              {['Good', 'Ok', 'Worst'].map((status) => (
                <label 
                  key={status}
                  className={`
                    cursor-pointer border rounded-lg p-3 text-center transition-all
                    ${sanitationStatus === status 
                      ? (status === 'Good' ? 'bg-green-100 border-green-500 text-green-700 font-bold shadow-sm' : 
                         status === 'Ok' ? 'bg-yellow-100 border-yellow-500 text-yellow-700 font-bold shadow-sm' : 
                         'bg-red-100 border-red-500 text-red-700 font-bold shadow-sm')
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}
                  `}
                >
                  <input
                    type="radio"
                    name="sanitation"
                    value={status}
                    checked={sanitationStatus === status}
                    onChange={() => setSanitationStatus(status as any)}
                    className="hidden"
                  />
                  {status}
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              * "Worst" indicates overflowing garbage, open drains, or severe hygiene issues.
            </p>
          </div>
        </div>

        {/* Section 3: Health Report */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Suspected Disease</label>
            <select
              className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
              value={diseaseType}
              onChange={(e) => setDiseaseType(e.target.value)}
            >
              {DISEASES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Affected Count</label>
            <input
              type="number"
              min="1"
              className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
              value={affectedCount}
              onChange={(e) => setAffectedCount(parseInt(e.target.value))}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Key Symptoms</label>
          <input
            type="text"
            placeholder="e.g., High fever, joint pain, rash (helps AI identify disease)"
            className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Additional Notes</label>
          <textarea
            rows={2}
            placeholder="Any specific observations..."
            className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !selectedVillageName || !workerName}
          className={`w-full py-3.5 rounded-lg font-bold text-white flex items-center justify-center gap-2 transition-all shadow-md
            ${isSubmitting || !selectedVillageName || !workerName ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg active:scale-[0.99]'}`}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin w-5 h-5" /> AI Analyzing Risks...
            </>
          ) : (
            <>
              <Send className="w-5 h-5" /> Submit Report & Predict Risk
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default AshaForm;
