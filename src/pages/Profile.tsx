import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardShell } from "@/components/fixbud/DashboardShell";
import { AddressPicker, AddressData } from "@/components/fixbud/AddressPicker";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Plus, Trash2, Pencil, Star } from "lucide-react";
import { PhoneSection } from "@/components/fixbud/PhoneSection";
import { NameSection } from "@/components/fixbud/NameSection";
import { toast } from "sonner";

interface SavedAddress {
  id: string;
  label: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  region: string | null;
  postal_code: string | null;
  country: string;
  lat: number;
  lng: number;
  is_default: boolean;
}

interface Profile {
  default_address_id: string | null;
}

const ProfilePage = () => {
  const { user, role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workerAddr, setWorkerAddr] = useState<Partial<AddressData>>({});
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [defaultAddressId, setDefaultAddressId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SavedAddress | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [draft, setDraft] = useState<AddressData | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Try to fetch with default_address_id first (migration applied)
      const [profRes, addrRes] = await Promise.all([
        supabase.from("profiles").select(
          "address_line1, address_line2, city, region, postal_code, country, lat, lng, default_address_id",
        ).eq("id", user.id).maybeSingle(),
        supabase.from("addresses").select("*").eq("user_id", user.id).order("created_at"),
      ]);
      
      if (profRes.data) {
        const data = profRes.data as any;
        const { default_address_id, ...addrData } = data;
        setWorkerAddr(addrData);
        setDefaultAddressId(default_address_id ?? null);
      }
      setAddresses((addrRes.data ?? []) as SavedAddress[]);
    } catch (error: any) {
      // Fallback if migration hasn't been applied yet
      if (error.message?.includes("default_address_id")) {
        const [profRes, addrRes] = await Promise.all([
          supabase.from("profiles").select(
            "address_line1, address_line2, city, region, postal_code, country, lat, lng",
          ).eq("id", user.id).maybeSingle(),
          supabase.from("addresses").select("*").eq("user_id", user.id).order("created_at"),
        ]);
        if (profRes.data) setWorkerAddr(profRes.data as Partial<AddressData>);
        setAddresses((addrRes.data ?? []) as SavedAddress[]);
        console.warn("Migration not yet applied: default_address_id column unavailable. Please run migrations.");
      } else {
        throw error;
      }
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const saveWorkerAddress = async () => {
    if (!user || !workerAddr.address_line1 || !workerAddr.city || !workerAddr.country
      || workerAddr.lat == null || workerAddr.lng == null) {
      toast.error("Please complete the address.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      address_line1: workerAddr.address_line1,
      address_line2: workerAddr.address_line2 ?? null,
      city: workerAddr.city,
      region: workerAddr.region ?? null,
      postal_code: workerAddr.postal_code ?? null,
      country: workerAddr.country,
      lat: workerAddr.lat,
      lng: workerAddr.lng,
    }).eq("id", user.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Profile location saved!");
    load();
  };

  const openNew = () => {
    setEditing(null);
    setLabelDraft("Home");
    setDraft(null);
    setDialogOpen(true);
  };

  const openEdit = (a: SavedAddress) => {
    setEditing(a);
    setLabelDraft(a.label);
    setDraft({
      address_line1: a.address_line1,
      address_line2: a.address_line2,
      city: a.city,
      region: a.region,
      postal_code: a.postal_code,
      country: a.country,
      lat: a.lat,
      lng: a.lng,
    });
    setDialogOpen(true);
  };

  const saveAddress = async () => {
    if (!user || !draft || !labelDraft.trim()) {
      toast.error("Please fill in a label and address.");
      return;
    }
    if (!draft.address_line1 || !draft.city || !draft.country) {
      toast.error("Address line 1, city and country are required.");
      return;
    }
    const payload = {
      user_id: user.id,
      label: labelDraft.trim(),
      address_line1: draft.address_line1,
      address_line2: draft.address_line2 ?? null,
      city: draft.city,
      region: draft.region ?? null,
      postal_code: draft.postal_code ?? null,
      country: draft.country,
      lat: draft.lat,
      lng: draft.lng,
    };
    const { error } = editing
      ? await supabase.from("addresses").update(payload).eq("id", editing.id)
      : await supabase.from("addresses").insert({ ...payload, is_default: addresses.length === 0 });
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Address updated." : "Address saved.");
    setDialogOpen(false);
    load();
  };

  const deleteAddress = async (id: string) => {
    const { error } = await supabase.from("addresses").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Address removed.");
    load();
  };

  const setDefault = async (id: string) => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ default_address_id: id })
        .eq("id", user.id);
      if (error) {
        // If migration not applied yet, show info message
        if (error.message?.includes("default_address_id")) {
          toast.error("Feature not yet available. Please wait for database update.");
        } else {
          toast.error(error.message);
        }
        return;
      }
      toast.success("Default address updated.");
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardShell title="My profile" subtitle="Manage your location and saved addresses.">
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : role === "worker" ? (
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Contact information</h2>
            {user && <NameSection userId={user.id} />}
            {user && <PhoneSection userId={user.id} />}
          </Card>
          <Card className="p-6">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">Service location</h2>
              <p className="text-sm text-muted-foreground">
                Required to place bids. Customers will see your pin on the map.
              </p>
            </div>
            <AddressPicker value={workerAddr} onChange={setWorkerAddr} />
            <div className="mt-4 flex justify-end">
              <Button onClick={saveWorkerAddress} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save location
              </Button>
            </div>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Contact information</h2>
            {user && <NameSection userId={user.id} />}
            {user && <PhoneSection userId={user.id} />}
          </Card>

          <section>
            <div className="mb-4 flex items-center justify-between">
              <div>
              <h2 className="text-xl font-semibold">Saved addresses</h2>
              <p className="text-sm text-muted-foreground">
                Pick one to share with a worker after they're hired.
              </p>
            </div>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" /> Add address
            </Button>
          </div>

          {addresses.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">
              No addresses yet. Add one to get started.
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {addresses.map((a) => (
                <Card key={a.id} className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                       <div className="flex items-center gap-2">
                         <MapPin className="h-4 w-4 text-primary" />
                         <h3 className="font-semibold">{a.label}</h3>
                         {defaultAddressId === a.id && (
                           <Badge variant="secondary" className="gap-1">
                             <Star className="h-3 w-3" /> Default
                           </Badge>
                         )}
                       </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {a.address_line1}
                        {a.address_line2 ? `, ${a.address_line2}` : ""}<br />
                        {a.city}{a.region ? `, ${a.region}` : ""}{a.postal_code ? ` ${a.postal_code}` : ""}<br />
                        {a.country}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {defaultAddressId !== a.id && (
                      <Button size="sm" variant="outline" onClick={() => setDefault(a.id)} disabled={saving}>
                        <Star className="h-4 w-4" /> Make default
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => openEdit(a)}>
                      <Pencil className="h-4 w-4" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteAddress(a.id)}>
                      <Trash2 className="h-4 w-4" /> Delete
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
          </section>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild><span className="hidden" /></DialogTrigger>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit address" : "New address"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                placeholder="Home, Office, Mom's place…"
              />
            </div>
            <AddressPicker
              value={draft ?? {}}
              onChange={setDraft}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveAddress}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  );
};

export default ProfilePage;
