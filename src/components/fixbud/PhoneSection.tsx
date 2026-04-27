import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Pencil, CheckCircle, X, Save } from "lucide-react";
import { toast } from "sonner";
import { isValidBDPhone, normaliseBDPhone } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface PhoneSectionProps {
  userId: string;
}

export const PhoneSection = ({ userId }: PhoneSectionProps) => {
  const [phone, setPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    supabase
      .from("profiles")
      .select("phone")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (mounted) {
          if (error) {
            toast.error(error.message);
            setPhone(null);
          } else {
            setPhone((data?.phone as string) || null);
          }
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [userId]);

  const onEdit = () => {
    setDraft(phone ?? "");
    setEditing(true);
    setInlineError(null);
  };

  const onCancel = () => {
    setEditing(false);
    setDraft("");
    setInlineError(null);
  };

  const onSave = async () => {
    setInlineError(null);
    if (!isValidBDPhone(draft)) {
      setInlineError("Invalid Bangladeshi phone number.");
      return;
    }

    const normalized = normaliseBDPhone(draft);
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ phone: normalized })
      .eq("id", userId);

    setSaving(false);
    if (!error) {
      setPhone(normalized);
      setEditing(false);
      setDraft("");
      toast.success("Phone number updated.");
    } else if (error.code === "23505") {
      setInlineError("This phone number is already in use.");
    } else {
      toast.error(error.message);
    }
  };

  if (loading) {
    return (
      <div className="py-4 flex items-center gap-2"> <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> Loading phone... </div>
    );
  }

  if (!editing) {
    return (
      <div className="py-4 flex items-center gap-4">
        <div>
          <div className="text-sm font-medium">Mobile phone</div>
          <div className="text-lg">{phone ?? <span className="text-muted-foreground">No phone number set</span>}</div>
        </div>
        <Button variant="outline" size="sm" onClick={onEdit} aria-label="Edit phone">
          <Pencil className="h-4 w-4" /> Edit
        </Button>
      </div>
    );
  }

  return (
    <div className="py-4 flex flex-col gap-2 min-w-[240px] max-w-sm">
      <div className="text-sm font-medium">Mobile phone</div>
      <Input
        autoFocus
        value={draft}
        disabled={saving}
        placeholder="01XXXXXXXXX"
        onChange={e => setDraft(e.target.value)}
        maxLength={20}
        data-testid="phone-input"
      />
      {inlineError && <div className="text-red-600 text-xs mt-1" data-testid="inline-error">{inlineError}</div>}
      <div className="flex gap-2 mt-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          <X className="h-4 w-4" /> Cancel
        </Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} <Save className="h-4 w-4" /> Save
        </Button>
      </div>
    </div>
  );
};
