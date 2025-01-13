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
    <div className="h-12 border-b flex items-center justify-between px-4 bg-background">
      <div className="flex-1 max-w-2xl mx-auto relative">
        <Input
          type="text"
          placeholder="Search workspace..."
          className="w-full pl-10"
        />
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      </div>
      <Button
        variant="ghost"
        onClick={handleLogout}
        className="ml-4"
      >
        Logout
      </Button>
    </div>
  );
}
