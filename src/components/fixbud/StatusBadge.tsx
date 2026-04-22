import { cn } from "@/lib/utils";

type Status = "pending" | "accepted" | "completed" | "cancelled";

const styles: Record<Status, string> = {
  pending: "bg-secondary text-secondary-foreground",
  accepted: "bg-primary/10 text-primary",
  completed: "bg-accent/20 text-accent-foreground",
  cancelled: "bg-destructive/10 text-destructive",
};

export const StatusBadge = ({ status }: { status: Status }) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
      styles[status],
    )}
  >
    {status}
  </span>
);