import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Hammer, Star, ArrowLeft, Loader2 } from "lucide-react";

interface Profile {
  id: string;
  name: string;
  average_rating: number;
}

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  customer: { name: string } | null;
}

const Stars = ({ value }: { value: number }) => (
  <div className="flex">
    {[1, 2, 3, 4, 5].map((n) => (
      <Star
        key={n}
        className={`h-4 w-4 ${
          n <= Math.round(value) ? "fill-accent text-accent" : "text-muted-foreground/30"
        }`}
      />
    ))}
  </div>
);

const WorkerProfile = () => {
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [profRes, revRes] = await Promise.all([
        supabase.from("profiles").select("id, name, average_rating").eq("id", id).maybeSingle(),
        supabase
          .from("reviews")
          .select("id, rating, comment, created_at, customer:profiles!reviews_customer_id_fkey(name)")
          .eq("worker_id", id)
          .order("created_at", { ascending: false }),
      ]);
      setProfile(profRes.data as Profile | null);
      setReviews((revRes.data ?? []) as unknown as Review[]);
      setLoading(false);
    })();
  }, [id]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Hammer className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold">FixBud</span>
          </Link>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/dashboard/customer">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-6 py-10">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !profile ? (
          <Card className="p-10 text-center text-muted-foreground">Worker not found.</Card>
        ) : (
          <>
            <Card className="mb-8 p-8">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                  {profile.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h1 className="text-2xl font-bold">{profile.name}</h1>
                  <div className="mt-1 flex items-center gap-2">
                    <Stars value={Number(profile.average_rating)} />
                    <span className="text-sm text-muted-foreground">
                      {Number(profile.average_rating).toFixed(2)} • {reviews.length} review
                      {reviews.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              </div>
            </Card>

            <h2 className="mb-4 text-xl font-semibold">Reviews</h2>
            {reviews.length === 0 ? (
              <Card className="p-10 text-center text-muted-foreground">
                No reviews yet.
              </Card>
            ) : (
              <div className="space-y-3">
                {reviews.map((r) => (
                  <Card key={r.id} className="p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Stars value={r.rating} />
                        <span className="text-sm font-medium">{r.customer?.name ?? "Anon"}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {r.comment && <p className="mt-2 text-sm">{r.comment}</p>}
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default WorkerProfile;