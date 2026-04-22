import { useState, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
}

interface Props {
  defaultCategoryId?: string;
  trigger?: React.ReactNode;
  onCreated?: () => void;
}

export const PostJobDialog = ({ defaultCategoryId, trigger, onCreated }: Props) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? "");
  const [budget, setBudget] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("service_categories")
      .select("id, name")
      .order("name")
      .then(({ data }) => setCategories(data ?? []));
  }, [open]);

  useEffect(() => {
    if (defaultCategoryId) setCategoryId(defaultCategoryId);
  }, [defaultCategoryId]);

  const reset = () => {
    setTitle("");
    setDescription("");
    setBudget("");
    setCategoryId(defaultCategoryId ?? "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!categoryId) {
      toast.error("Please choose a category.");
      return;
    }
    const budgetNum = parseFloat(budget);
    if (Number.isNaN(budgetNum) || budgetNum < 0) {
      toast.error("Budget must be a positive number.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("job_requests").insert({
      title,
      description,
      category_id: categoryId,
      customer_id: user.id,
      budget: budgetNum,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Job posted!");
    reset();
    setOpen(false);
    onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="h-4 w-4" />
            Post a job
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Post a new job</DialogTitle>
          <DialogDescription>
            Tell pros what you need. They'll review and accept.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="job-title">Title</Label>
            <Input
              id="job-title"
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Fix leaky kitchen faucet"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="job-cat">Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="job-cat">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="job-desc">Description</Label>
            <Textarea
              id="job-desc"
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue, location, and any specifics."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="job-budget">Budget (USD)</Label>
            <Input
              id="job-budget"
              type="number"
              min="0"
              step="0.01"
              required
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="150"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Post job
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};