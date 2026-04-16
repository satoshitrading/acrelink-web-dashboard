import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Menu, Settings, UserCircle2 } from "lucide-react";
import acreLinkLogo from "@/assets/acrelink-logo.png";
import { useDashboard } from "@/contexts/dashboard/DashboardContext";

export function DashboardNav() {
  const {
    navigate,
    availableSiteIds,
    userSiteId,
    handleAdminSiteChange,
    isAdmin,
    handleLogout,
  } = useDashboard();

  return (
    <nav className="bg-card border-b-2 border-border/50 sticky top-0 z-50 shadow-industrial">
      <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap lg:gap-0 gap-4 items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-4 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Go to dashboard home"
          >
            <img src={acreLinkLogo} alt="AcreLink" className="h-12 w-auto drop-shadow-md" />
            <div>
            <h1 className="text-2xl font-display font-bold text-foreground">AcreLink Dashboard</h1>
            </div>
          </button>
        </div>
        <div className="flex items-center gap-4 lg:w-[unset] justify-[unset] w-full justify-between">
          {availableSiteIds.length > 1 && (
            <div className="flex items-center gap-3 lg:w-[unset] w-full">
              <label className="text-sm text-muted-foreground font-medium whitespace-nowrap">Active Site:</label>
              <select
                value={userSiteId ?? ""}
                onChange={handleAdminSiteChange}
                className="lg:w-[unset] w-full items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none h-9 rounded-md px-3 border-2 sm:flex text-[#3a3835] bg-background"
              >
                {availableSiteIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="hidden md:flex items-center gap-4 ">
            {isAdmin && (
              <Button
                size="sm"
                className="border-2 bg-background text-[#3a3835] hover:bg-accent hover:text-accent-foreground"
                onClick={() => navigate("/technicians")}
              >
                Add Technician
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="outline" className="border-2" aria-label="Account menu">
                  <UserCircle2 className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => navigate("/settings")}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="md:hidden flex items-center gap-2">
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="outline" className="border-2" aria-label="Admin menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => navigate("/technicians")}>Add Technician</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="outline" className="border-2" aria-label="Account menu">
                  <UserCircle2 className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => navigate("/settings")}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </nav>
  );
}
