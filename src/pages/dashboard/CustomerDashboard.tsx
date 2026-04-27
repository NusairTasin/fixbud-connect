import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardShell } from "@/components/fixbud/DashboardShell";
import { PostJobDialog } from "@/components/fixbud/PostJobDialog";
import { ReviewDialog } from "@/components/fixbud/ReviewDialog";
import { StatusBadge } from "@/components/fixbud/StatusBadge";
import { BidsList } from "@/components/fixbud/BidsList";
import { ShareAddressDialog } from "@/components/fixbud/ShareAddressDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Loader2, Wrench, Star, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { PhoneContact } from "@/components/fixbud/PhoneContact";

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

interface Job {
  id: string;
  title: string;
  description: string;
  status: "pending" | "accepted" | "completed" | "cancelled";
  budget: number;
  worker_id: string | null;
  category_id: string;
  created_at: string;
  shared_address_id: string | null;
  address_changed: boolean;
  shared_address: {
    label: string;
    address_line1: string;
    city: string;
    country: string;
  } | null;
  service_categories: { name: string } | null;
  worker: { id: string; name: string } | null;
  bid_count?: { count: number }[];
  workerPhone?: string | null;
}

const CustomerDashboard = () => {
  const { user } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultCat, setDefaultCat] = useState<string | undefined>();
  const [reviewedJobIds, setReviewedJobIds] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState<Job | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [catsRes, jobsRes, reviewsRes] = await Promise.all([
        supabase.from("service_categories").select("*").order("name"),
        supabase
          .from("job_requests")
          .select(
            "*, service_categories(name), worker:profiles!job_requests_worker_id_fkey(id, name), shared_address:addresses!job_requests_shared_address_id_fkey(label, address_line1, city, country), bid_count:bids(count)",
          )
          .eq("customer_id", user.id)
          .order("created_at", { ascending: false }),
        supabase.from("reviews").select("job_id").eq("customer_id", user.id),
      ]);
      if (jobsRes.error) throw jobsRes.error;
      if (catsRes.error) throw catsRes.error;
      setCategories(catsRes.data ?? []);
      setJobs((jobsRes.data ?? []) as unknown as Job[]);
      setReviewedJobIds(new Set((reviewsRes.data ?? []).map((r) => r.job_id)));
      // Fetch worker phone for accepted/completed jobs
      const loadedJobs = (jobsRes.data ?? []) as unknown as Job[];
      const jobsWithPhone = await Promise.all(
        loadedJobs.map(async (j) => {
          if ((j.status === "accepted" || j.status === "completed") && j.worker_id) {
            try {
              const { data } = await supabase.rpc("get_contact_phone", { target_user_id: j.worker_id });
              return { ...j, workerPhone: (data as string | null) ?? null };
            } catch (phoneErr) {
              console.error("Failed to fetch worker phone for job", j.id, phoneErr);
              return { ...j, workerPhone: null };
            }
          }
          return j;
        }),
      );
      setJobs(jobsWithPhone as unknown as Job[]);
    } catch (err: any) {
      // If the rich query fails (e.g. migration not applied), fall back to a simple job fetch
      console.error("Failed to load jobs with extended query:", err);
      toast.error?.("Unable to load extended job details; showing basic job list.");
      try {
        const [catsRes, jobsRes, reviewsRes] = await Promise.all([
          supabase.from("service_categories").select("*").order("name"),
          supabase
            .from("job_requests")
            .select("*")
            .eq("customer_id", user.id)
            .order("created_at", { ascending: false }),
          supabase.from("reviews").select("job_id").eq("customer_id", user.id),
        ]);
        setCategories(catsRes.data ?? []);
        const fallbackJobs = ((jobsRes.data ?? []) as any[]).map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          status: r.status,
          budget: r.budget,
          worker_id: r.worker_id ?? null,
          category_id: r.category_id,
          created_at: r.created_at,
          shared_address_id: r.shared_address_id ?? null,
          address_changed: (r.address_changed as boolean) ?? false,
          shared_address: null,
          service_categories: null,
          worker: r.worker_id ? { id: r.worker_id, name: "" } : null,
        })) as unknown as Job[];
        const fallbackWithPhone = await Promise.all(
          fallbackJobs.map(async (j) => {
            if ((j.status === "accepted" || j.status === "completed") && j.worker_id) {
              try {
                const { data } = await supabase.rpc("get_contact_phone", { target_user_id: j.worker_id });
                return { ...j, workerPhone: (data as string | null) ?? null };
              } catch (phoneErr) {
                console.error("Failed to fetch worker phone for job", j.id, phoneErr);
                return { ...j, workerPhone: null };
              }
            }
            return j;
          }),
        );
        setJobs(fallbackWithPhone as unknown as Job[]);
        setReviewedJobIds(new Set((reviewsRes.data ?? []).map((r) => r.job_id)));
      } catch (err2: any) {
        console.error("Fallback job load failed:", err2);
        setCategories([]);
        setJobs([]);
        setReviewedJobIds(new Set());
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: re-fetch whenever job_requests or bids change for this customer
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`customer-dashboard-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_requests", filter: `customer_id=eq.${user.id}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bids" },
        () => load(),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  const handleCancel = async (jobId: string) => {
    const { error } = await supabase
      .from("job_requests")
      .update({ status: "cancelled" })
      .eq("id", jobId);
    if (error) return;
    load();
  };

  return (
    <DashboardShell title="Find a pro" subtitle="Browse categories or post a custom job.">
      <section className="mb-12">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Service categories</h2>
          <PostJobDialog onCreated={load} />
        </div>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((c) => (
              <Card
                key={c.id}
                className="group cursor-pointer p-5 transition-shadow hover:shadow-[var(--shadow-soft)]"
                onClick={() => setDefaultCat(c.id)}
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-primary">
                  <Wrench className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">{c.name}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {c.description}
                </p>
                <PostJobDialog
                  defaultCategoryId={c.id}
                  onCreated={load}
                  trigger={
                    <Button variant="ghost" size="sm" className="mt-3 px-0 text-primary">
                      Post in {c.name} →
                    </Button>
                  }
                />
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">My requests</h2>
        {jobs.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">
            <p>No jobs posted yet. Pick a category above to get started.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {jobs.map((j) => {
              const canReview =
                j.status === "completed" && j.worker_id && !reviewedJobIds.has(j.id);
              const bidCount = j.bid_count?.[0]?.count ?? 0;
              return (
                <Card key={j.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{j.title}</h3>
                        <StatusBadge status={j.status} />
                        {j.status === "pending" && bidCount > 0 && (
                          <Badge variant="secondary">
                            {bidCount} {bidCount === 1 ? "bid" : "bids"}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {j.service_categories?.name} • ${j.budget.toLocaleString()}
                        {j.worker && (
                          <>
                            {" "}• Pro:{" "}
                            <Link
                              to={`/workers/${j.worker.id}`}
                              className="text-primary hover:underline"
                            >
                              {j.worker.name}
                            </Link>
                          </>
                        )}
                      </p>
                      {(j.status === "accepted" || j.status === "completed") && j.worker && (
                        <div className="mt-1">
                          <PhoneContact phone={j.workerPhone ?? null} />
                        </div>
                      )}
                      <p className="mt-2 text-sm">{j.description}</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      {canReview && (
                        <Button size="sm" onClick={() => setReviewing(j)}>
                          <Star className="h-4 w-4" />
                          Leave review
                        </Button>
                      )}
                      {j.status === "completed" && reviewedJobIds.has(j.id) && (
                        <span className="text-xs text-muted-foreground">Reviewed ✓</span>
                      )}
                       {(j.status === "accepted" || j.status === "completed") && (
                          <ShareAddressDialog
                            jobId={j.id}
                            currentAddressId={j.shared_address_id}
                            addressChanged={j.address_changed ?? false}
                            onShared={load}
                          />
                        )}
                      {(j.status === "pending" || j.status === "accepted") && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCancel(j.id)}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                  {j.shared_address && (j.status === "accepted" || j.status === "completed") && (
                    <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm">
                      <span className="font-medium">Shared address:</span>{" "}
                      <span className="text-muted-foreground">
                        {j.shared_address.label} — {j.shared_address.address_line1}, {j.shared_address.city}, {j.shared_address.country}
                      </span>
                    </div>
                  )}
                  {j.status === "pending" && (
                    <Collapsible className="mt-3">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="px-2 text-primary">
                          <ChevronDown className="h-4 w-4" />
                          {bidCount > 0
                            ? `Review ${bidCount} ${bidCount === 1 ? "bid" : "bids"}`
                            : "View bids"}
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-3">
                        <BidsList jobId={j.id} canAccept onAccepted={load} />
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Hidden trigger consumer for category-quick-post */}
      {defaultCat && (
        <PostJobDialog
          defaultCategoryId={defaultCat}
          trigger={<span className="hidden" />}
          onCreated={() => {
            setDefaultCat(undefined);
            load();
          }}
        />
      )}

      {reviewing && reviewing.worker && (
        <ReviewDialog
          open={!!reviewing}
          onOpenChange={(o) => !o && setReviewing(null)}
          jobId={reviewing.id}
          workerId={reviewing.worker.id}
          workerName={reviewing.worker.name}
          onSubmitted={() => {
            setReviewing(null);
            load();
          }}
        />
      )}
    </DashboardShell>
  );
};

export default CustomerDashboard;
