import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, MapPin, Search, Locate } from "lucide-react";
import { toast } from "sonner";

// Fix default marker icon paths under Vite
const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

export interface AddressData {
  address_line1: string;
  address_line2?: string | null;
  city: string;
  region?: string | null;
  postal_code?: string | null;
  country: string;
  lat: number;
  lng: number;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address: {
    house_number?: string;
    road?: string;
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    region?: string;
    postcode?: string;
    country?: string;
  };
}

const Recenter = ({ pos }: { pos: [number, number] }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(pos, map.getZoom() < 13 ? 14 : map.getZoom());
  }, [pos, map]);
  return null;
};

interface Props {
  value: Partial<AddressData>;
  onChange: (next: AddressData) => void;
}

export const AddressPicker = ({ value, onChange }: Props) => {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [pos, setPos] = useState<[number, number]>([
    value.lat ?? 40.7128,
    value.lng ?? -74.006,
  ]);
  const [form, setForm] = useState<AddressData>({
    address_line1: value.address_line1 ?? "",
    address_line2: value.address_line2 ?? "",
    city: value.city ?? "",
    region: value.region ?? "",
    postal_code: value.postal_code ?? "",
    country: value.country ?? "",
    lat: value.lat ?? pos[0],
    lng: value.lng ?? pos[1],
  });
  const markerRef = useRef<L.Marker>(null);

  // Sync upward whenever form/pos changes
  useEffect(() => {
    onChange({ ...form, lat: pos[0], lng: pos[1] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, pos]);

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(q)}`,
        { headers: { Accept: "application/json" } },
      );
      const data: NominatimResult[] = await res.json();
      if (!data.length) {
        toast.error("No results — try refining the address.");
        return;
      }
      applyResult(data[0]);
    } catch {
      toast.error("Could not look up that address.");
    } finally {
      setSearching(false);
    }
  };

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lng}`,
        { headers: { Accept: "application/json" } },
      );
      const data: NominatimResult = await res.json();
      if (data?.address) applyResult({ ...data, lat: String(lat), lon: String(lng) });
    } catch {
      // silent
    }
  };

  const applyResult = (r: NominatimResult) => {
    const a = r.address;
    const line1 = [a.house_number, a.road].filter(Boolean).join(" ") ||
      a.suburb || a.neighbourhood || "";
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    setPos([lat, lng]);
    setForm((prev) => ({
      ...prev,
      address_line1: line1 || prev.address_line1,
      city: a.city || a.town || a.village || prev.city,
      region: a.state || a.region || prev.region,
      postal_code: a.postcode || prev.postal_code,
      country: a.country || prev.country,
      lat,
      lng,
    }));
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = p.coords.latitude;
        const lng = p.coords.longitude;
        setPos([lat, lng]);
        reverseGeocode(lat, lng);
      },
      () => toast.error("Could not get your location."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const m = markerRef.current;
        if (!m) return;
        const ll = m.getLatLng();
        setPos([ll.lat, ll.lng]);
        reverseGeocode(ll.lat, ll.lng);
      },
    }),
    [],
  );

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search an address…"
            className="pl-8"
          />
        </div>
        <Button type="submit" disabled={searching} variant="secondary">
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Find
        </Button>
        <Button type="button" variant="outline" onClick={useMyLocation}>
          <Locate className="h-4 w-4" />
          My location
        </Button>
      </form>

      <div className="h-64 overflow-hidden rounded-lg border">
        <MapContainer
          center={pos}
          zoom={13}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker
            position={pos}
            draggable
            eventHandlers={eventHandlers}
            ref={markerRef}
          />
          <Recenter pos={pos} />
        </MapContainer>
      </div>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <MapPin className="h-3 w-3" />
        Drag the pin to fine-tune your exact location.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="line1">Address line 1</Label>
          <Input
            id="line1"
            required
            value={form.address_line1}
            onChange={(e) => setForm({ ...form, address_line1: e.target.value })}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="line2">Address line 2 (optional)</Label>
          <Input
            id="line2"
            value={form.address_line2 ?? ""}
            onChange={(e) => setForm({ ...form, address_line2: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            required
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="region">State / region</Label>
          <Input
            id="region"
            value={form.region ?? ""}
            onChange={(e) => setForm({ ...form, region: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="postal">Postal code</Label>
          <Input
            id="postal"
            value={form.postal_code ?? ""}
            onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="country">Country</Label>
          <Input
            id="country"
            required
            value={form.country}
            onChange={(e) => setForm({ ...form, country: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
};
