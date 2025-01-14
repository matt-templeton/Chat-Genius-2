import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppDispatch } from "@/store";
import { logout } from "@/store/slices/auth-slice";
import { useLocation } from "wouter";

export function Toolbar() {
  const dispatch = useAppDispatch();
  const [, setLocation] = useLocation();

  const handleLogout = () => {
    dispatch(logout());
    setLocation('/login');
  };

  return (
    <div className="h-12 border-b px-4 flex items-center justify-between">
      <div className="font-semibold">Chat Genius</div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            Menu
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleLogout}>
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}