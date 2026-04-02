import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Menu } from "lucide-react";
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
          <img src={acreLinkLogo} alt="AcreLink" className="h-12 w-auto drop-shadow-md" />
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">AcreLink Dashboard</h1>
          </div>
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
            <Button
              size="sm"
              variant="outline"
              className="border-2 bg-background text-[#3a3835] hover:bg-accent hover:text-accent-foreground"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="outline" className="md:hidden border-2">
                <Menu className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {isAdmin && (
                <DropdownMenuItem onClick={() => navigate("/technicians")}>Add Technician</DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  );
}
