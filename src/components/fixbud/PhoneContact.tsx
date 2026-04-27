import { Phone } from "lucide-react";

interface PhoneContactProps {
  phone: string | null;
}

export const PhoneContact = ({ phone }: PhoneContactProps) => {
  if (!phone) {
    return <span className="text-muted-foreground text-sm">No phone provided</span>;
  }

  return (
    <a
      href={`tel:${phone}`}
      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
    >
      <Phone className="h-4 w-4" />
      {phone}
    </a>
  );
};
