"use client";

import { useEffect, useRef } from "react";
import type { JSX } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapSite } from "@/lib/map-sites";

const ESRI_URL =
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTR = "Imagery © Esri, Maxar, Earthstar Geographics";

export function SiteMap({
    sites,
    selectedId,
    hoveredId,
    onSelect,
    onHover,
    groupedSiteIds,
}: {
    sites: MapSite[];
    selectedId: string | null;
    hoveredId: string | null;
    onSelect: (id: string | null) => void;
    onHover: (id: string | null) => void;
    groupedSiteIds?: Set<string>;
}): JSX.Element {
    const elRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const markersRef = useRef<Map<string, L.Marker>>(new Map());

    // Init once — create the Leaflet map instance
    useEffect(() => {
        if (!elRef.current || mapRef.current) return;

        const withCoords = sites.filter((s) => s.lat != null && s.lng != null);
        const center: [number, number] = withCoords.length
            ? [
                  withCoords.reduce((a, s) => a + (s.lat as number), 0) / withCoords.length,
                  withCoords.reduce((a, s) => a + (s.lng as number), 0) / withCoords.length,
              ]
            : [44.14, -114.91];

        const map = L.map(elRef.current, {
            attributionControl: true,
            scrollWheelZoom: true,
        }).setView(center, 16);

        L.tileLayer(ESRI_URL, { attribution: ESRI_ATTR, maxZoom: 19 }).addTo(map);

        map.on("click", () => onSelect(null));
        mapRef.current = map;

        if (withCoords.length > 1) {
            map.fitBounds(L.latLngBounds(withCoords.map((s) => [s.lat as number, s.lng as number])).pad(0.3));
        }

        const markersSnapshot = markersRef.current;
        return () => {
            map.remove();
            mapRef.current = null;
            markersSnapshot.clear();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // (Re)draw markers whenever sites / selection / hover changes
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        markersRef.current.forEach((m) => m.remove());
        markersRef.current.clear();

        for (const s of sites) {
            if (s.lat == null || s.lng == null) continue;

            const isSel = s.id === selectedId;
            const isHov = s.id === hoveredId;
            const isFav = s.tier === "fav";
            const isGrouped = groupedSiteIds?.has(s.id) ?? false;
            const cls = [
                "cw-pin",
                s.open ? "open" : "booked",
                isFav ? "fav" : "",
                isSel ? "sel" : "",
                isHov ? "hov" : "",
                isGrouped ? "adjacent-highlight" : "",
            ]
                .filter(Boolean)
                .join(" ");

            const html = `<div class="${cls}">${isFav ? "<span class='cw-pin-star'>★</span>" : ""}<span class="cw-pin-label">${s.id}</span></div>`;
            const icon = L.divIcon({
                html,
                className: "cw-pin-wrap",
                iconSize: [34, 34],
                iconAnchor: [17, 34],
            });

            const marker = L.marker([s.lat, s.lng], { icon }).addTo(map);
            marker.on("click", (e) => {
                L.DomEvent.stopPropagation(e);
                onSelect(s.id);
            });
            marker.on("mouseover", () => onHover(s.id));
            marker.on("mouseout", () => onHover(null));
            markersRef.current.set(s.id, marker);
        }
    }, [sites, selectedId, hoveredId, onSelect, onHover, groupedSiteIds]);

    return (
        <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 430 }}>
            {/* Legibility scrim at top — dark gradient over the satellite tile attribution area */}
            <div
                aria-hidden="true"
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 60,
                    background: "linear-gradient(to bottom, rgba(20,15,12,0.45) 0%, transparent 100%)",
                    zIndex: 500,
                    pointerEvents: "none",
                }}
            />
            <div ref={elRef} style={{ width: "100%", height: "100%", minHeight: 430 }} />
        </div>
    );
}
