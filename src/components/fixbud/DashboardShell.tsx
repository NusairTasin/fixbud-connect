import { Link, NavLink, useNavigate } from "react-router-dom";
import { Hammer, LogOut, User, Map as MapIcon, LayoutDashboard, Menu } from "lucide-react";
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

interface Props {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export const DashboardShell = ({ title, subtitle, children }: Props) => {
  const { signOut, role, user } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Hammer className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold tracking-tight">FixBud</span>
            <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground capitalize">
              {role}
            </span>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            <Button variant="ghost" size="sm" asChild>
              <NavLink to="/dashboard">
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </NavLink>
            </Button>
            {role === "customer" && (
              <Button variant="ghost" size="sm" asChild>
                <NavLink to="/map">
                  <MapIcon className="h-4 w-4" />
                  Map
                </NavLink>
              </Button>
            )}
            <Button variant="ghost" size="sm" asChild>
              <NavLink to="/profile">
                <User className="h-4 w-4" />
                Profile
              </NavLink>
            </Button>
            <span className="hidden text-sm text-muted-foreground sm:inline">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
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
                  <SheetClose asChild>
                    <Button variant="ghost" className="w-full justify-start" asChild>
                      <NavLink to="/dashboard">
                        <LayoutDashboard className="h-4 w-4" />
                        Dashboard
                      </NavLink>
                    </Button>
                  </SheetClose>

                  {role === "customer" && (
                    <SheetClose asChild>
                      <Button variant="ghost" className="w-full justify-start" asChild>
                        <NavLink to="/map">
                          <MapIcon className="h-4 w-4" />
                          Map
                        </NavLink>
                      </Button>
                    </SheetClose>
                  )}

                  <SheetClose asChild>
                    <Button variant="ghost" className="w-full justify-start" asChild>
                      <NavLink to="/profile">
                        <User className="h-4 w-4" />
                        Profile
                      </NavLink>
                    </Button>
                  </SheetClose>

                  <div className="pt-2 text-xs text-muted-foreground">
                    Signed in as {user?.email}
                  </div>

                  <Button variant="outline" className="w-full" onClick={handleSignOut}>
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
      </main>
    </div>
  );
};