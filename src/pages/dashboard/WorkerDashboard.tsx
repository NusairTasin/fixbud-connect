import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardShell } from "@/components/fixbud/DashboardShell";
import { StatusBadge } from "@/components/fixbud/StatusBadge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CheckCircle2, Hammer } from "lucide-react";
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
  service_categories: { name: string } | null;
  customer: { name: string } | null;
}

const WorkerDashboard = () => {
  const { user } = useAuth();
  const [available, setAvailable] = useState<Job[]>([]);
  const [active, setActive] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("job_requests")
      .select("*, service_categories(name), customer:profiles!job_requests_customer_id_fkey(name)")
      .order("created_at", { ascending: false });
    const all = (data ?? []) as unknown as Job[];
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

  const handleAccept = async (jobId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("job_requests")
      .update({ status: "accepted", worker_id: user.id })
      .eq("id", jobId);
    if (error) {
      toast.error(error.message);
      return;
    }
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

  const renderJob = (j: Job, mode: "browse" | "active") => (
    <Card key={j.id} className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{j.title}</h3>
            <StatusBadge status={j.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {j.service_categories?.name} • ${j.budget.toLocaleString()}
            {j.customer && ` • From ${j.customer.name}`}
          </p>
          <p className="mt-2 text-sm">{j.description}</p>
        </div>
        <div className="flex flex-col gap-2">
          {mode === "browse" && (
            <Button size="sm" onClick={() => handleAccept(j.id)}>
              <Hammer className="h-4 w-4" />
              Accept job
            </Button>
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

          <TabsContent value="available" className="mt-6 space-y-3">
            {available.length === 0 ? (
              <Card className="p-10 text-center text-muted-foreground">
                No pending jobs right now. Check back soon.
              </Card>
            ) : (
              available.map((j) => renderJob(j, "browse"))
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