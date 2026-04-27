import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Pencil, X, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface NameSectionProps {
  userId: string;
}

export const NameSection = ({ userId }: NameSectionProps) => {
  const [name, setName] = useState<string | null>(null);
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
      .select("name")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (mounted) {
          if (error) {
            toast.error(error.message);
            setName(null);
          } else {
            setName((data?.name as string) || null);
          }
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [userId]);

  const onEdit = () => {
    setDraft(name ?? "");
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
    const trimmed = draft.trim();
    if (!trimmed) {
      setInlineError("Name cannot be empty.");
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ name: trimmed })
      .eq("id", userId);

    setSaving(false);
    if (!error) {
      setName(trimmed);
      setEditing(false);
      setDraft("");
      toast.success("Name updated.");
    } else {
      toast.error(error.message);
    }
  };

  if (loading) {
    return (
      <div className="py-4 flex items-center gap-2"> <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> Loading name... </div>
    );
  }

  if (!editing) {
    return (
      <div className="py-4 flex items-center gap-4 border-b pb-4 mb-4">
        <div>
          <div className="text-sm font-medium">Name</div>
          <div className="text-lg">{name ?? <span className="text-muted-foreground">No name set</span>}</div>
        </div>
        <Button variant="outline" size="sm" onClick={onEdit} aria-label="Edit name">
          <Pencil className="h-4 w-4" /> Edit
        </Button>
      </div>
    );
  }

  return (
    <div className="py-4 flex flex-col gap-2 min-w-[240px] max-w-sm border-b pb-4 mb-4">
      <div className="text-sm font-medium">Name</div>
      <Input
        autoFocus
        value={draft}
        disabled={saving}
        placeholder="Enter your name"
        onChange={e => setDraft(e.target.value)}
        maxLength={100}
        data-testid="name-input"
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
