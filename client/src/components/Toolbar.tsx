import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppDispatch, useAppSelector } from "@/store";
import { logout } from "@/store/slices/auth-slice";
import { useLocation } from "wouter";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";

export function Toolbar() {
  const dispatch = useAppDispatch();
  const [, setLocation] = useLocation();
  const { user } = useAppSelector((state) => state.auth);
  const { currentWorkspace } = useAppSelector((state) => state.workspace);

  const handleLogout = () => {
    dispatch(logout());
    setLocation('/login');
  };

  return (
    <div className="h-12 px-4 flex items-center justify-between bg-toolbar text-toolbar-text">
      <div className="flex items-center gap-2">
        <span className="font-semibold">{currentWorkspace?.name || 'Chat Genius'}</span>
        {user && (
          <>
            <Separator orientation="vertical" className="h-4 bg-white/20" />
            <span className="text-sm text-toolbar-text/70">
              {user.displayName}
            </span>
          </>
        )}
      </div>

      <div className="flex-1 max-w-md mx-4">
        <Input
          type="search"
          placeholder={`Search ${currentWorkspace?.name || 'Chat Genius'}...`}
          className="w-full h-8 bg-white/10 border-white/10 text-toolbar-text placeholder:text-toolbar-text/50"
        />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="text-toolbar-text hover:bg-white/10">
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