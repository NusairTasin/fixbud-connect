import { useEffect, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardShell } from "@/components/fixbud/DashboardShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Locate, Star } from "lucide-react";
import { toast } from "sonner";

const customerIcon = L.divIcon({
  className: "",
  html: `<div style="background:hsl(var(--primary));border:3px solid white;border-radius:50%;width:18px;height:18px;box-shadow:0 0 0 2px hsl(var(--primary)/.4)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const workerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

interface Worker {
  id: string;
  name: string;
  average_rating: number;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
  lat: number;
  lng: number;
}

interface SavedAddress {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

const MapPage = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [center, setCenter] = useState<[number, number] | null>(null);
  const [selectedAddrId, setSelectedAddrId] = useState<string>("");

  const getGeoErrorMessage = (err: GeolocationPositionError) => {
    // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
    if (!window.isSecureContext) {
      return "Location requires HTTPS (or http://localhost). Open the app on localhost or serve over HTTPS.";
    }
    if (err.code === 1) return "Location permission denied. Enable it in your browser site settings.";
    if (err.code === 2) return "Location unavailable. Check GPS/Wi‑Fi and try again.";
    if (err.code === 3) return "Location request timed out. Try again.";
    return err.message || "Could not get your location.";
  };

  useEffect(() => {
    (async () => {
      if (!user) return;
      // Workers with coordinates — RLS allows authenticated users to see profiles
      const [workerRes, addrRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, name, average_rating, address_line1, address_line2, city, region, postal_code, country, lat, lng")
          .not("lat", "is", null)
          .not("lng", "is", null),
        supabase.from("addresses").select("id, label, lat, lng, is_default").eq("user_id", user.id),
      ]);

      const workerList = (workerRes.data ?? []).filter((p): p is Worker => p.lat != null && p.lng != null);
      setWorkers(workerList);

      const addrs = (addrRes.data ?? []) as SavedAddress[];
      setAddresses(addrs);
      const def = addrs.find((a: SavedAddress & { is_default?: boolean }) =>
        (a as { is_default?: boolean }).is_default,
      ) ?? addrs[0];
      if (def) {
        setSelectedAddrId(def.id);
        setCenter([def.lat, def.lng]);
      } else if (workerList.length > 0) {
        setCenter([workerList[0].lat, workerList[0].lng]);
      } else {
        setCenter([40.7128, -74.006]);
      }
      setLoading(false);
    })();
  }, [user]);

  const handleAddrChange = (id: string) => {
    setSelectedAddrId(id);
    const a = addresses.find((x) => x.id === id);
    if (a) setCenter([a.lat, a.lng]);
  };

  const useBrowserLocation = async () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported.");
      return;
    }
    // Browsers deny geolocation on non-secure origins by default.
    if (!window.isSecureContext) {
      toast.error(
        "Location is blocked because this site is not secure. Use http://localhost:8080 or HTTPS.",
      );
      return;
    }

    // If the user previously denied location for this origin, most browsers will not show
    // a popup again; they fail immediately with PERMISSION_DENIED.
    if ("permissions" in navigator) {
      try {
        const status = await navigator.permissions.query({
          // Permissions API uses different types across browsers
          name: "geolocation" as PermissionName,
        });
        if (status.state === "denied") {
          toast.error("Location is blocked for this site. Enable it in your browser site settings.");
          return;
        }
      } catch {
        // Ignore; we'll fall back to getCurrentPosition error codes.
      }
    }

    navigator.geolocation.getCurrentPosition(
      (p) => setCenter([p.coords.latitude, p.coords.longitude]),
      (err) => toast.error(getGeoErrorMessage(err)),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  return (
    <DashboardShell title="Workers nearby" subtitle="Find pros around your saved address.">
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
        {addresses.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Center on:</span>
            <Select value={selectedAddrId} onValueChange={handleAddrChange}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Pick an address" />
              </SelectTrigger>
              <SelectContent>
                {addresses.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button variant="outline" size="sm" onClick={useBrowserLocation}>
          <Locate className="h-4 w-4" /> Use my location
        </Button>
        <span className="ml-auto text-sm text-muted-foreground">
          {workers.length} worker{workers.length === 1 ? "" : "s"} on the map
        </span>
      </Card>

      {loading || !center ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="h-[calc(100vh-280px)] min-h-[420px] overflow-hidden rounded-lg border">
          <MapContainer
            center={center}
            zoom={12}
            scrollWheelZoom
            style={{ height: "100%", width: "100%" }}
            key={`${center[0]}-${center[1]}`}
          >
            <TileLayer
              attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={center} icon={customerIcon}>
              <Popup>You are here</Popup>
            </Marker>
            {workers.map((w) => (
              <Marker key={w.id} position={[w.lat, w.lng]} icon={workerIcon}>
                <Popup>
                  <div className="space-y-1">
                    <Link to={`/workers/${w.id}`} className="font-semibold text-primary hover:underline">
                      {w.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {[w.address_line1, w.address_line2, w.city, w.region, w.postal_code, w.country].filter(Boolean).join(", ")}
                    </div>
                    <div className="flex items-center gap-1 text-xs">
                      <Star className="h-3 w-3 fill-current text-primary" />
                      {Number(w.average_rating).toFixed(2)}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}
    </DashboardShell>
  );
};

export default MapPage;
