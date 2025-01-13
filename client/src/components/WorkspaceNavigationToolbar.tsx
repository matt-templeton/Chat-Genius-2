import { Plus, Home } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export function WorkspaceNavigationToolbar() {
  return (
    <div className="w-16 border-r bg-sidebar flex flex-col items-center py-4 space-y-4">
      {/* WorkspaceIcon */}
      <Avatar className="h-10 w-10 cursor-pointer hover:opacity-80">
        <AvatarImage src="/workspace-icon.png" alt="Workspace" />
        <AvatarFallback>W</AvatarFallback>
      </Avatar>

      {/* WorkspaceHomeIcon */}
      <Button variant="ghost" size="icon" className="rounded-lg">
        <Home className="h-5 w-5" />
      </Button>

      <div className="flex-1" />

      {/* CreateNewButton */}
      <Button variant="ghost" size="icon" className="rounded-lg">
        <Plus className="h-5 w-5" />
      </Button>

      {/* UserIcon */}
      <Avatar className="h-8 w-8 cursor-pointer hover:opacity-80">
        <AvatarImage src="/user-avatar.png" alt="User" />
        <AvatarFallback>U</AvatarFallback>
      </Avatar>
    </div>
  );
}