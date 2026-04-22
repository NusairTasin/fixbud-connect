import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardShell } from "@/components/fixbud/DashboardShell";
import { StatusBadge } from "@/components/fixbud/StatusBadge";
import { BidDialog } from "@/components/fixbud/BidDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, Search, X } from "lucide-react";
import { toast } from "sonner";

interface Job {
  id: string;
  title: string;
  description: string;
  status: "pending" | "accepted" | "completed" | "cancelled";
  budget: number;
  worker_id: string | null;
  customer_id: string;
  created_at: string;
  category_id: string;
  service_categories: { name: string } | null;
  customer: { name: string } | null;
}

interface Category {
  id: string;
  name: string;
}

interface MyBid {
  job_id: string;
  amount: number;
  status: "pending" | "accepted" | "rejected" | "withdrawn";
}

const WorkerDashboard = () => {
  const { user } = useAuth();
  const [available, setAvailable] = useState<Job[]>([]);
  const [active, setActive] = useState<Job[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [myBids, setMyBids] = useState<Record<string, MyBid>>({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [minBudget, setMinBudget] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [sort, setSort] = useState<"newest" | "budget_desc" | "budget_asc">("newest");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [jobsRes, catsRes, bidsRes] = await Promise.all([
      supabase
        .from("job_requests")
        .select(
          "*, service_categories(name), customer:profiles!job_requests_customer_id_fkey(name)",
        )
        .order("created_at", { ascending: false }),
      supabase.from("service_categories").select("id, name").order("name"),
      supabase.from("bids").select("job_id, amount, status").eq("worker_id", user.id),
    ]);
    const all = (jobsRes.data ?? []) as unknown as Job[];
    setCategories(catsRes.data ?? []);
    const bidsMap: Record<string, MyBid> = {};
    (bidsRes.data ?? []).forEach((b) => {
      bidsMap[b.job_id] = b as MyBid;
    });
    setMyBids(bidsMap);
    setAvailable(all.filter((j) => j.status === "pending" && !j.worker_id));
    setActive(
      all.filter(
        (j) =>
          j.worker_id === user.id &&
          (j.status === "accepted" || j.status === "completed"),
      ),
    );
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleComplete = async (jobId: string) => {
    const { error } = await supabase
      .from("job_requests")
      .update({ status: "completed" })
      .eq("id", jobId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Marked as completed");
    load();
  };

  const filteredAvailable = useMemo(() => {
    let list = [...available];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.description.toLowerCase().includes(q),
      );
    }
    if (categoryFilter !== "all") {
      list = list.filter((j) => j.category_id === categoryFilter);
    }
    const min = parseFloat(minBudget);
    if (!Number.isNaN(min)) list = list.filter((j) => j.budget >= min);
    const max = parseFloat(maxBudget);
    if (!Number.isNaN(max)) list = list.filter((j) => j.budget <= max);
    if (sort === "budget_desc") list.sort((a, b) => b.budget - a.budget);
    else if (sort === "budget_asc") list.sort((a, b) => a.budget - b.budget);
    else
      list.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    return list;
  }, [available, search, categoryFilter, minBudget, maxBudget, sort]);

  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("all");
    setMinBudget("");
    setMaxBudget("");
    setSort("newest");
  };

  const hasFilters =
    search !== "" ||
    categoryFilter !== "all" ||
    minBudget !== "" ||
    maxBudget !== "" ||
    sort !== "newest";

  const renderJob = (j: Job, mode: "browse" | "active") => (
    <Card key={j.id} className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{j.title}</h3>
            <StatusBadge status={j.status} />
            {mode === "browse" && myBids[j.id] && (
              <Badge variant="secondary">
                Your bid: ${myBids[j.id].amount.toLocaleString()}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {j.service_categories?.name} • Budget ${j.budget.toLocaleString()}
            {j.customer && ` • From ${j.customer.name}`}
          </p>
          <p className="mt-2 text-sm">{j.description}</p>
        </div>
        <div className="flex flex-col gap-2">
          {mode === "browse" &&
            (myBids[j.id] ? (
              <Button size="sm" variant="outline" disabled>
                Bid placed
              </Button>
            ) : (
              <BidDialog
                jobId={j.id}
                jobTitle={j.title}
                suggested={j.budget}
                onPlaced={load}
              />
            ))}
          {mode === "active" && j.status === "accepted" && (
            <Button size="sm" onClick={() => handleComplete(j.id)}>
              <CheckCircle2 className="h-4 w-4" />
              Mark complete
            </Button>
          )}
        </div>
      </div>
    </Card>
  );

  return (
    <DashboardShell title="Job board" subtitle="Browse open requests and manage your active work.">
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs defaultValue="available" className="w-full">
          <TabsList>
            <TabsTrigger value="available">
              Available ({available.length})
            </TabsTrigger>
            <TabsTrigger value="active">My jobs ({active.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="available" className="mt-6 space-y-4">
            <Card className="p-4">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                <div className="space-y-1.5 lg:col-span-2">
                  <Label htmlFor="search">Search</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Title or description"
                      className="pl-8"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cat-filter">Category</Label>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger id="cat-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Budget range</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="0"
                      placeholder="Min"
                      value={minBudget}
                      onChange={(e) => setMinBudget(e.target.value)}
                    />
                    <Input
                      type="number"
                      min="0"
                      placeholder="Max"
                      value={maxBudget}
                      onChange={(e) => setMaxBudget(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sort">Sort</Label>
                  <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
                    <SelectTrigger id="sort">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest first</SelectItem>
                      <SelectItem value="budget_desc">Budget: high to low</SelectItem>
                      <SelectItem value="budget_asc">Budget: low to high</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {hasFilters && (
                <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    Showing {filteredAvailable.length} of {available.length} jobs
                  </span>
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <X className="h-4 w-4" />
                    Clear filters
                  </Button>
                </div>
              )}
            </Card>

            {filteredAvailable.length === 0 ? (
              <Card className="p-10 text-center text-muted-foreground">
                {available.length === 0
                  ? "No pending jobs right now. Check back soon."
                  : "No jobs match your filters."}
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredAvailable.map((j) => renderJob(j, "browse"))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="active" className="mt-6 space-y-3">
            {active.length === 0 ? (
              <Card className="p-10 text-center text-muted-foreground">
                You haven't accepted any jobs yet.
              </Card>
            ) : (
              active.map((j) => renderJob(j, "active"))
            )}
          </TabsContent>
        </Tabs>
      )}
    </DashboardShell>
  );
};

export default WorkerDashboard;