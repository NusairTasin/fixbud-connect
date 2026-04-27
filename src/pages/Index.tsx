import { Link, useNavigate } from "react-router-dom";
import { Wrench, ShieldCheck, Sparkles, ArrowRight, Hammer, Search, Menu, LayoutDashboard, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const features = [
  {
    icon: ShieldCheck,
    title: "Vetted pros",
    body: "Every worker is rated by real customers. Hire with confidence.",
  },
  {
    icon: Sparkles,
    title: "Post in seconds",
    body: "Describe the job, set a budget, and get matched fast.",
  },
  {
    icon: Wrench,
    title: "Track every step",
    body: "From request to completion — full visibility, no surprises.",
  },
];

const Index = () => {
  const { session, loading, signOut } = useAuth();
  const navigate = useNavigate();

  const primaryHref = session ? "/dashboard" : "/auth";

  const handleSignOut = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="container mx-auto flex items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Hammer className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold tracking-tight">FixBud</span>
        </div>
        <nav className="hidden items-center gap-2 sm:flex">
          {loading ? null : session ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/dashboard">Dashboard</Link>
              </Button>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/auth">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/auth">Get started</Link>
              </Button>
            </>
          )}
        </nav>

        <div className="sm:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[320px]">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-2">
                {loading ? null : session ? (
                  <>
                    <SheetClose asChild>
                      <Button variant="ghost" className="w-full justify-start" asChild>
                        <Link to="/dashboard">
                          <LayoutDashboard className="h-4 w-4" />
                          Dashboard
                        </Link>
                      </Button>
                    </SheetClose>
                    <Button variant="outline" className="w-full" onClick={handleSignOut}>
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </Button>
                  </>
                ) : (
                  <>
                    <SheetClose asChild>
                      <Button variant="ghost" className="w-full justify-start" asChild>
                        <Link to="/auth">Sign in</Link>
                      </Button>
                    </SheetClose>
                    <SheetClose asChild>
                      <Button className="w-full" asChild>
                        <Link to="/auth">Get started</Link>
                      </Button>
                    </SheetClose>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={{ background: "var(--gradient-soft)" }}
      >
        <div className="container mx-auto grid gap-12 px-6 py-20 lg:grid-cols-2 lg:py-32">
          <div className="flex flex-col justify-center">
            <span className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-accent" />
              Trusted home services, on demand
            </span>
            <h1 className="text-5xl font-bold leading-[1.05] tracking-tight md:text-6xl lg:text-7xl">
              Connect with trusted{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "var(--gradient-hero)" }}
              >
                home-service pros
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              FixBud matches homeowners with skilled local workers — plumbers,
              electricians, carpenters and more. Post a job, accept a quote, get it done.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="group">
                <Link to={primaryHref}>
                  <Search className="h-4 w-4" />
                  Find a pro
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-primary/20 bg-card hover:bg-secondary"
              >
                <Link to={primaryHref}>
                  <Hammer className="h-4 w-4" />
                  Offer your services
                </Link>
              </Button>
            </div>
          </div>

          {/* Decorative panel */}
          <div className="relative hidden lg:block">
            <div
              className="absolute inset-0 rounded-3xl"
              style={{
                background: "var(--gradient-hero)",
                boxShadow: "var(--shadow-elegant)",
              }}
            />
            <div className="relative flex h-full flex-col justify-end p-10 text-primary-foreground">
              <div className="space-y-6">
                <div className="flex items-center gap-3 rounded-2xl bg-background/15 p-4 backdrop-blur-sm">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background/25">
                    <Wrench className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Leaky kitchen sink</p>
                    <p className="text-xs opacity-80">Accepted • Mike R. • 4.9★</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl bg-background/15 p-4 backdrop-blur-sm">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Repaint living room</p>
                    <p className="text-xs opacity-80">Pending • 3 quotes received</p>
                  </div>
                </div>
                <p className="pt-4 text-sm opacity-90">
                  Real jobs. Real pros. Real results.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Built for homeowners and pros alike
          </h2>
          <p className="mt-4 text-muted-foreground">
            Everything you need to get the job done — and nothing you don't.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-[var(--shadow-soft)]"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-6 pb-24">
        <div
          className="overflow-hidden rounded-3xl p-10 text-center md:p-16"
          style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-elegant)" }}
        >
          <h2 className="text-3xl font-bold text-primary-foreground md:text-4xl">
            Ready to get it fixed?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-primary-foreground/85">
            Join FixBud today and tap into a network of trusted local pros.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" variant="secondary">
              <Link to={primaryHref}>Find a pro</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              <Link to={primaryHref}>Offer your services</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="container mx-auto flex flex-col items-center justify-between gap-3 px-6 text-sm text-muted-foreground md:flex-row">
          <p>© {new Date().getFullYear()} FixBud. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
};

export default Index;
