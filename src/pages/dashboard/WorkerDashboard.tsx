import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "react-router-dom";
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
import { Loader2, CheckCircle2, Search, X, MapPin, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { PhoneContact } from "@/components/fixbud/PhoneContact";
import { NegotiationThread } from "@/components/fixbud/NegotiationThread";

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
  shared_address?: {
    label: string;
    address_line1: string;
    address_line2: string | null;
    city: string;
    region: string | null;
    postal_code: string | null;
    country: string;
  } | null;
  customerPhone?: string | null;
}

interface Category {
  id: string;
  name: string;
}

interface MyBid {
  id: string;
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
  const [hasLocation, setHasLocation] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [minBudget, setMinBudget] = useState("");
  const [maxBudget, setMaxBudget] = useState("");
  const [sort, setSort] = useState<"newest" | "budget_desc" | "budget_asc">("newest");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [jobsRes, catsRes, bidsRes, profRes] = await Promise.all([
        supabase
          .from("job_requests")
          .select(
            "*, service_categories(name), customer:profiles!job_requests_customer_id_fkey(name), shared_address:addresses!job_requests_shared_address_id_fkey(label, address_line1, address_line2, city, region, postal_code, country)",
          )
          .order("created_at", { ascending: false }),
        supabase.from("service_categories").select("id, name").order("name"),
        supabase.from("bids").select("id, job_id, amount, status").eq("worker_id", user.id),
        supabase.from("profiles").select("lat, lng").eq("id", user.id).maybeSingle(),
      ]);
      if (jobsRes.error) throw jobsRes.error;
      if (catsRes.error) throw catsRes.error;
      const all = (jobsRes.data ?? []) as unknown as Job[];
      setCategories(catsRes.data ?? []);
      setHasLocation(!!(profRes.data?.lat && profRes.data?.lng));
      const bidsMap: Record<string, MyBid> = {};
      (bidsRes.data ?? []).forEach((b) => {
        bidsMap[b.job_id] = b as MyBid;
      });
      setMyBids(bidsMap);
      setAvailable(all.filter((j) => j.status === "pending" && !j.worker_id));
      const activeJobs = all.filter(
        (j) => j.worker_id === user.id && (j.status === "accepted" || j.status === "completed"),
      );
      // Fetch customer phone for accepted jobs
      const activeWithPhone = await Promise.all(
        activeJobs.map(async (j) => {
          if (j.status !== "accepted") return j;
          try {
            const { data } = await supabase.rpc("get_contact_phone", { target_user_id: j.customer_id });
            return { ...j, customerPhone: (data as string | null) ?? null };
          } catch (phoneErr) {
            console.error("Failed to fetch customer phone for job", j.id, phoneErr);
            return { ...j, customerPhone: null };
          }
        }),
      );
      setActive(activeWithPhone);
    } catch (err: any) {
      console.error("WorkerDashboard rich query failed:", err);
      toast.error(err?.message ?? "Unable to load jobs. Please try again.");
      try {
        const [jobsRes, catsRes, bidsRes, profRes] = await Promise.all([
          supabase.from("job_requests").select("*").order("created_at", { ascending: false }),
          supabase.from("service_categories").select("id, name").order("name"),
          supabase.from("bids").select("id, job_id, amount, status").eq("worker_id", user.id),
          supabase.from("profiles").select("lat, lng").eq("id", user.id).maybeSingle(),
        ]);
        if (jobsRes.error) throw jobsRes.error;
        const all = (jobsRes.data ?? []) as any[];
        setCategories(catsRes.data ?? []);
        setHasLocation(!!(profRes.data?.lat && profRes.data?.lng));
        const bidsMap: Record<string, MyBid> = {};
        (bidsRes.data ?? []).forEach((b) => {
          bidsMap[b.job_id] = b as MyBid;
        });
        setMyBids(bidsMap);
        const mapped: Job[] = all.map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          status: r.status,
          budget: r.budget,
          worker_id: r.worker_id ?? null,
          customer_id: r.customer_id ?? "",
          created_at: r.created_at,
          category_id: r.category_id,
          service_categories: null,
          customer: null,
          shared_address: null,
        }));
        setAvailable(mapped.filter((j) => j.status === "pending" && !j.worker_id));
        const activeJobsFallback = mapped.filter(
          (j) => j.worker_id === user.id && (j.status === "accepted" || j.status === "completed"),
        );
        const activeWithPhoneFallback = await Promise.all(
          activeJobsFallback.map(async (j) => {
            if (j.status !== "accepted") return j;
            try {
              const { data } = await supabase.rpc("get_contact_phone", { target_user_id: j.customer_id });
              return { ...j, customerPhone: (data as string | null) ?? null };
            } catch (phoneErr) {
              console.error("Failed to fetch customer phone for job", j.id, phoneErr);
              return { ...j, customerPhone: null };
            }
          }),
        );
        setActive(activeWithPhoneFallback);
      } catch (err2: any) {
        console.error("WorkerDashboard fallback query failed:", err2);
        setCategories([]);
        setMyBids({});
        setAvailable([]);
        setActive([]);
        setHasLocation(true);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: re-fetch on any job_requests or bids change visible to this worker
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`worker-dashboard-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_requests" },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bids", filter: `worker_id=eq.${user.id}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bid_offers" },
        () => load(),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  const handleAcceptAtBudget = async (jobId: string) => {
    if (!user) return;
    // Directly update the job — the worker RLS UPDATE policy allows this
    // (pending job with no worker assigned). Then reject any competing bids.
    const { error, count } = await supabase
      .from("job_requests")
      .update({ worker_id: user.id, status: "accepted" })
      .eq("id", jobId)
      .eq("status", "pending")
      .is("worker_id", null)
      .select("id", { count: "exact", head: true });
    if (error) {
      toast.error(error.message);
      return;
    }
    if (count === 0) {
      toast.error("Job is no longer available.");
      load();
      return;
    }
    // Reject any pending bids on this job (best-effort, non-blocking)
    await supabase
      .from("bids")
      .update({ status: "rejected" })
      .eq("job_id", jobId)
      .eq("status", "pending");
    toast.success("Job accepted!");
    load();
  };

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
          {mode === "active" && (
            <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm">
              {j.shared_address ? (
                <>
                  <div className="flex items-center gap-1 font-medium">
                    <MapPin className="h-4 w-4 text-primary" />
                    {j.shared_address.label}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {j.shared_address.address_line1}
                    {j.shared_address.address_line2 ? `, ${j.shared_address.address_line2}` : ""}<br />
                    {j.shared_address.city}
                    {j.shared_address.region ? `, ${j.shared_address.region}` : ""}
                    {j.shared_address.postal_code ? ` ${j.shared_address.postal_code}` : ""}<br />
                    {j.shared_address.country}
                  </div>
                </>
              ) : (
                <span className="text-muted-foreground">
                  Waiting for the customer to share their address…
                </span>
              )}
              {j.status === "accepted" && (
                <div className="mt-2">
                  <PhoneContact phone={j.customerPhone ?? null} />
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {mode === "browse" && (
            myBids[j.id] ? (
              <div className="w-full">
                <NegotiationThread
                  bidId={myBids[j.id].id}
                  workerId={user!.id}
                  workerName=""
                  jobId={j.id}
                  viewerRole="worker"
                  onResolved={load}
                />
              </div>
            ) : hasLocation ? (
              <>
                <Button size="sm" onClick={() => handleAcceptAtBudget(j.id)}>
                  <CheckCircle2 className="h-4 w-4" />
                  Accept at ${j.budget.toLocaleString()}
                </Button>
                <BidDialog
                  jobId={j.id}
                  jobTitle={j.title}
                  suggested={j.budget}
                  onPlaced={load}
                  trigger={
                    <Button size="sm" variant="outline">
                      Place bid
                    </Button>
                  }
                />
              </>
            ) : (
              <Button size="sm" variant="outline" asChild>
                <Link to="/profile">Add location to accept/bid</Link>
              </Button>
            )
          )}
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
      {!loading && !hasLocation && (
        <Card className="mb-4 flex flex-wrap items-center gap-3 border-l-4 border-l-primary p-4">
          <AlertTriangle className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <p className="font-medium">Add your service location</p>
            <p className="text-sm text-muted-foreground">
              You need a location on your profile before you can bid on jobs.
            </p>
          </div>
          <Button asChild size="sm">
            <Link to="/profile">Add location</Link>
          </Button>
        </Card>
      )}
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
