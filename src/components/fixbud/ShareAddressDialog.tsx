import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { MapPin, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

interface SavedAddress {
  id: string;
  label: string;
  address_line1: string;
  city: string;
  country: string;
}

interface Props {
  jobId: string;
  currentAddressId: string | null;
  addressChanged: boolean;
  onShared?: () => void;
}

export const ShareAddressDialog = ({ jobId, currentAddressId, addressChanged, onShared }: Props) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string>(currentAddressId ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
    supabase
      .from("addresses")
      .select("id, label, address_line1, city, country")
      .eq("user_id", user.id)
      .order("created_at")
      .then(({ data }) => {
        setAddresses((data ?? []) as SavedAddress[]);
        if (!selected && data?.[0]) setSelected(data[0].id);
        setLoading(false);
      });
  }, [open, user, selected]);

  const handleShare = async () => {
    if (!selected) { toast.error("Pick an address first."); return; }
    setSaving(true);
    const { error } = await supabase
      .from("job_requests")
      .update({ shared_address_id: selected })
      .eq("id", jobId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Address shared with the worker.");
    setOpen(false);
    onShared?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={currentAddressId ? "outline" : "default"} disabled={addressChanged}>
          <MapPin className="h-4 w-4" />
          {currentAddressId ? (addressChanged ? "Address changed" : "Change address") : "Share address"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share address with the worker</DialogTitle>
          <DialogDescription>
            {addressChanged 
              ? "You've already changed the address once. No further changes are allowed."
              : "Pick which of your saved addresses to send. Only the assigned worker can see it."}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : addressChanged ? (
          <div className="rounded-md bg-muted/40 p-4 text-sm text-muted-foreground">
            <p>You have already changed the address once after the offer was accepted. No further changes are allowed.</p>
          </div>
        ) : addresses.length === 0 ? (
          <div className="rounded-md bg-muted/40 p-4 text-sm">
            You haven't saved any addresses yet.{" "}
            <Link to="/profile" className="text-primary underline">Add one →</Link>
          </div>
        ) : (
          <RadioGroup value={selected} onValueChange={setSelected} className="space-y-2">
            {addresses.map((a) => (
              <Label
                key={a.id}
                htmlFor={`addr-${a.id}`}
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted/50"
              >
                <RadioGroupItem id={`addr-${a.id}`} value={a.id} className="mt-1" />
                <div>
                  <div className="font-medium">{a.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {a.address_line1}, {a.city}, {a.country}
                  </div>
                </div>
              </Label>
            ))}
          </RadioGroup>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleShare} disabled={saving || !selected || addresses.length === 0 || addressChanged}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {currentAddressId && !addressChanged ? "Update address" : "Share"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
