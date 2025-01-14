import { Plus, Home } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppSelector } from "@/store";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { WorkspaceCreateDialog } from "./WorkspaceCreateDialog";
import { WorkspaceSwitchDialog } from "./WorkspaceSwitchDialog";
import { useAppDispatch } from "@/store";
import { fetchWorkspaces } from "@/store/workspaceSlice";
import { useToast } from "@/hooks/use-toast";
import { AddWorkspaceMemberDialog } from "./AddWorkspaceMemberDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function WorkspaceNavigationToolbar() {
  const { currentWorkspace, loading, error } = useAppSelector((state) => state.workspace);
  const [, setLocation] = useLocation();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isSwitchDialogOpen, setIsSwitchDialogOpen] = useState(false);
  const [isAddMemberDialogOpen, setIsAddMemberDialogOpen] = useState(false);
  const dispatch = useAppDispatch();
  const { toast } = useToast();

  useEffect(() => {
    // Fetch workspaces when component mounts
    dispatch(fetchWorkspaces())
      .unwrap()
      .catch((err) => {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load workspaces: " + err,
        });
      });
  }, [dispatch, toast]);

  const handleHomeClick = () => {
    setLocation('/chat');
  };

  const handleCreateNew = () => {
    setIsCreateDialogOpen(true);
  };

  const handleWorkspaceClick = () => {
    setIsSwitchDialogOpen(true);
  };

  return (
    <div className="w-16 border-r bg-sidebar flex flex-col items-center py-4 space-y-4">
      <TooltipProvider delayDuration={300}>
        {/* WorkspaceIcon with Dropdown */}
        <Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="p-0 h-auto hover:bg-transparent focus-visible:ring-offset-sidebar"
              >
                <Avatar className="h-10 w-10 cursor-pointer hover:opacity-80 transition-opacity">
                  <AvatarImage src="/workspace-icon.png" alt={currentWorkspace?.name || 'Workspace'} />
                  <AvatarFallback className="bg-primary/10">
                    {currentWorkspace?.name?.charAt(0) || 'W'}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-48">
              <DropdownMenuItem onClick={() => setIsSwitchDialogOpen(true)}>
                Switch Workspace
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => setIsAddMemberDialogOpen(true)}
                disabled={!currentWorkspace}
              >
                Add Workspace Member
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <TooltipContent side="right">
            <p>{currentWorkspace?.name || 'Select Workspace'}</p>
          </TooltipContent>
        </Tooltip>

        {/* WorkspaceHomeIcon */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleHomeClick}
              className="rounded-lg hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors focus-visible:ring-offset-sidebar"
            >
              <Home className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Home</p>
          </TooltipContent>
        </Tooltip>

        <div className="flex-1 border-t border-sidebar-border my-2 w-8" />

        {/* CreateNewButton */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleCreateNew}
              disabled={loading}
              className="rounded-lg hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors focus-visible:ring-offset-sidebar"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Create New Workspace</p>
          </TooltipContent>
        </Tooltip>

        {/* UserIcon */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              className="p-0 h-auto hover:bg-transparent focus-visible:ring-offset-sidebar"
            >
              <Avatar className="h-8 w-8 cursor-pointer hover:opacity-80 transition-opacity">
                <AvatarImage src="/user-avatar.png" alt="User" />
                <AvatarFallback className="bg-primary/10">U</AvatarFallback>
              </Avatar>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>User Settings</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Workspace Create Dialog */}
      <WorkspaceCreateDialog 
        isOpen={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />

      {/* Add Member Dialog */}
      {currentWorkspace && (
        <AddWorkspaceMemberDialog
          workspaceId={currentWorkspace.workspaceId}
          open={isAddMemberDialogOpen}
          onOpenChange={setIsAddMemberDialogOpen}
        />
      )}

      {/* Workspace Switch Dialog */}
      <WorkspaceSwitchDialog 
        isOpen={isSwitchDialogOpen}
        onOpenChange={setIsSwitchDialogOpen}
        onCreateNew={handleCreateNew}
      />
    </div>
  );
}