import React, { useEffect, useRef } from 'react';
import { Village, HealthStatus, OutbreakCluster } from '../types';

interface VillageMapProps {
  villages: Village[];
  onSelectVillage: (village: Village) => void;
  selectedVillageId?: string;
  clusters?: OutbreakCluster[];
  flyToLocation?: { lat: number; lng: number } | null;
}

const VillageMap: React.FC<VillageMapProps> = ({ villages, onSelectVillage, selectedVillageId, clusters = [], flyToLocation }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const layerGroupRef = useRef<any>(null);
  const clusterLayerGroupRef = useRef<any>(null);
  const tempMarkerRef = useRef<any>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapRef.current) return;
    
    // Check if Leaflet is loaded
    const L = (window as any).L;
    if (!L) {
      console.error("Leaflet not loaded");
      return;
    }

    if (!mapInstanceRef.current) {
      // Center roughly between Krishna and Vizianagaram to show both (Zoom out slightly)
      const map = L.map(mapRef.current).setView([17.5, 82.5], 7);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(map);

      mapInstanceRef.current = map;
      clusterLayerGroupRef.current = L.layerGroup().addTo(map); // Bottom layer
      layerGroupRef.current = L.layerGroup().addTo(map); // Top layer (markers)
    }

    return () => {
      // Cleanup map instance on unmount if necessary
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Handle programatic selection (fly to existing village)
  useEffect(() => {
    if (!selectedVillageId || !mapInstanceRef.current) return;
    
    const village = villages.find(v => v.id === selectedVillageId);
    if (village) {
      // Remove temp marker if selecting a real village
      if (tempMarkerRef.current) {
        tempMarkerRef.current.remove();
        tempMarkerRef.current = null;
      }

      // Fly to the location with animation
      mapInstanceRef.current.flyTo(
        [village.coordinates.lat, village.coordinates.lng], 
        12, // Zoom in closer on selection
        { animate: true, duration: 1.5 }
      );
    }
  }, [selectedVillageId, villages]);

  // Handle manual search fly to (fly to arbitrary location)
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    
    // Logic to remove marker if flyToLocation is null
    if (!flyToLocation) {
        if (tempMarkerRef.current) {
            tempMarkerRef.current.remove();
            tempMarkerRef.current = null;
        }
        return;
    }

    const L = (window as any).L;
    
    // Fly to location
    mapInstanceRef.current.flyTo(
        [flyToLocation.lat, flyToLocation.lng],
        12,
        { animate: true, duration: 1.5 }
    );

    // Add a temporary marker so user knows where the search landed
    if (tempMarkerRef.current) tempMarkerRef.current.remove();
    
    tempMarkerRef.current = L.marker([flyToLocation.lat, flyToLocation.lng], {
        // Create a custom blue pin for search results
        icon: L.divIcon({
            className: 'custom-search-pin',
            html: `<div style="
              background-color: #3b82f6; 
              width: 16px; 
              height: 16px; 
              border-radius: 50%; 
              border: 3px solid white; 
              box-shadow: 0 4px 6px rgba(0,0,0,0.3);
              position: relative;
            ">
              <div style="
                position: absolute;
                bottom: -8px;
                left: 50%;
                transform: translateX(-50%);
                width: 2px;
                height: 8px;
                background-color: #3b82f6;
              "></div>
            </div>`,
            iconSize: [16, 24],
            iconAnchor: [8, 24]
        })
    })
    .addTo(mapInstanceRef.current)
    .bindPopup(`<div class="text-center font-bold text-slate-700">Searched Location</div>`)
    .openPopup();

  }, [flyToLocation]);

  // Update Markers & Clusters
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapInstanceRef.current || !layerGroupRef.current || !clusterLayerGroupRef.current) return;

    const layerGroup = layerGroupRef.current;
    const clusterLayer = clusterLayerGroupRef.current;
    
    layerGroup.clearLayers();
    clusterLayer.clearLayers();

    // 1. Draw Clusters
    clusters.forEach(cluster => {
      const color = cluster.severity === HealthStatus.RED ? '#ef4444' : '#eab308';
      
      const circle = L.circle([cluster.center.lat, cluster.center.lng], {
        color: color,
        fillColor: color,
        fillOpacity: 0.15,
        radius: cluster.radius * 2, // Visual size
        weight: 1,
        dashArray: '5, 10'
      }).addTo(clusterLayer);

      circle.bindPopup(`
        <div class="text-center font-sans">
          <strong class="text-red-700">⚠️ Outbreak Cluster Detected</strong><br/>
          <span class="text-xs">Villages: ${cluster.villageIds.length}</span><br/>
          <p class="text-[10px] mt-1 italic border-t pt-1">${cluster.aiAdvice}</p>
        </div>
      `);
    });

    // 2. Draw Village Markers
    villages.forEach((village) => {
      const isSelected = village.id === selectedVillageId;
      
      let color = '#22c55e'; // Green
      let radius = 8;
      
      if (village.status === HealthStatus.YELLOW) {
        color = '#eab308';
        radius = 10;
      } else if (village.status === HealthStatus.RED) {
        color = '#ef4444';
        radius = 12;
      }

      // If Red, add a pulsing effect
      if (village.status === HealthStatus.RED) {
        const pulse = L.circleMarker([village.coordinates.lat, village.coordinates.lng], {
          radius: 25,
          color: color,
          fillColor: color,
          fillOpacity: 0.2,
          stroke: false,
          className: 'pulse-animation'
        });
        pulse.addTo(layerGroup);
      }

      const marker = L.circleMarker([village.coordinates.lat, village.coordinates.lng], {
        radius: isSelected ? radius + 4 : radius,
        color: isSelected ? '#ffffff' : color,
        weight: isSelected ? 3 : 1,
        fillColor: color,
        fillOpacity: 0.9,
      });

      // Updated Tooltip content
      const tooltipContent = `
        <div class="text-center">
          <b class="text-sm">${village.name}</b><br/>
          <span class="text-xs text-slate-500">${village.district}</span><br/>
          <div class="mt-1">
            Active Cases: <b>${village.activeCases}</b><br/>
            Last Reporter: ${village.lastAshaWorker || 'N/A'}
          </div>
        </div>
      `;

      marker.bindTooltip(tooltipContent, {
        direction: 'top',
        offset: [0, -10],
        opacity: 0.95,
        className: 'custom-map-tooltip'
      });

      marker.on('click', () => {
        onSelectVillage(village);
      });

      marker.addTo(layerGroup);
    });

  }, [villages, selectedVillageId, onSelectVillage, clusters]);

  return (
    <div className="w-full h-full min-h-[400px] bg-white rounded-xl shadow-inner border border-slate-200 overflow-hidden relative">
       <div id="map" ref={mapRef} className="w-full h-full z-0" style={{ minHeight: '500px' }}></div>
       
       <div className="absolute top-4 right-4 bg-white/90 p-2 rounded shadow text-xs space-y-1 z-[1000] border border-slate-200 backdrop-blur-sm">
        <div className="font-semibold mb-1">Risk Zones</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500"></span> Outbreak</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-yellow-500"></span> Warning</div>
        <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-500"></span> Safe</div>
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200"><span className="w-3 h-3 rounded-full border border-red-500 bg-red-100"></span> Cluster Zone</div>
      </div>
    </div>
  );
};

export default VillageMap;