import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";

export function Toolbar() {
  const [, setLocation] = useLocation();

  const handleLogout = () => {
    // TODO: Implement logout logic
    setLocation('/login');
  };

  return (
    <div className="h-12 border-b flex items-center px-4 bg-background">
      {/* Left section - empty for balance */}
      <div className="w-64" />

      {/* Center section - WorkspaceSearchBar */}
      <div className="flex-1 flex justify-center">
        <div className="w-full max-w-2xl relative">
          <Input
            type="text"
            placeholder="Search workspace..."
            className="w-full pl-10"
          />
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      {/* Right section - LogoutButton */}
      <div className="w-64 flex justify-end">
        <Button
          variant="ghost"
          onClick={handleLogout}
          className="text-muted-foreground hover:text-foreground"
        >
          Logout
        </Button>
      </div>
    </div>
  );
}