import { Plus, Home, Settings, LogOut, Check, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppSelector } from "@/store";
import { useLocation } from "wouter";
import { useState, useEffect, KeyboardEvent } from "react";
import { WorkspaceCreateDialog } from "./WorkspaceCreateDialog";
import { WorkspaceSwitchDialog } from "./WorkspaceSwitchDialog";
import { useAppDispatch } from "@/store";
import { fetchWorkspaces } from "@/store/workspaceSlice";
import { useToast } from "@/hooks/use-toast";
import { AddWorkspaceMemberDialog } from "./AddWorkspaceMemberDialog";
import { Input } from "@/components/ui/input";
import { logout, updateUserStatus } from "@/store/slices/auth-slice";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { PreferencesOverlay } from "./PreferencesOverlay";
import { api } from "@/lib/api";
import { UserSettingsDialog } from "./UserSettingsDialog";

export function WorkspaceNavigationToolbar() {
  const { currentWorkspace, loading, error } = useAppSelector((state) => state.workspace);
  const { user } = useAppSelector((state) => state.auth);
  const [, setLocation] = useLocation();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isSwitchDialogOpen, setIsSwitchDialogOpen] = useState(false);
  const [isAddMemberDialogOpen, setIsAddMemberDialogOpen] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [isUserSettingsOpen, setIsUserSettingsOpen] = useState(false);
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const [statusInput, setStatusInput] = useState("");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

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

  useEffect(() => {
    // Initialize status input with user's current status if it exists
    if (user?.statusMessage) {
      setStatusInput(user.statusMessage);
    }
  }, [user?.statusMessage]);

  const handleStatusUpdate = async () => {
    if (isUpdatingStatus) return;
    
    try {
      setIsUpdatingStatus(true);
      const token = localStorage.getItem('accessToken');
      if (!token) {
        throw new Error('No access token found');
      }

      const data = await api.fetch("/api/v1/users/status", {
        method: 'PATCH',
        body: JSON.stringify({ status: statusInput }),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      // Update status in Redux store with the returned status
      dispatch(updateUserStatus(data.statusMessage));
      
      // Clear input on success
      setStatusInput("");
      toast({
        description: "Status updated successfully",
      });
    } catch (error) {
      console.error('Status update error:', error);
      const message = error instanceof Error ? error.message : "Failed to update status";
      toast({
        variant: "destructive",
        title: "Error",
        description: message
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleStatusKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleStatusUpdate();
    }
  };

  const handleHomeClick = () => {
    setLocation('/chat');
  };

  const handleCreateNew = () => {
    setIsCreateDialogOpen(true);
  };

  const handleWorkspaceClick = () => {
    setIsSwitchDialogOpen(true);
  };

  const handleLogout = () => {
    dispatch(logout());
    setLocation('/login');
  };

  return (
    <div className="w-16 flex flex-col items-center py-4 space-y-4 bg-toolbar text-white">
      <TooltipProvider delayDuration={300}>
        {/* WorkspaceIcon with Dropdown */}
        <Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="p-0 h-auto hover:bg-white/10 focus-visible:ring-offset-toolbar text-white"
              >
                <Avatar className="h-10 w-10 cursor-pointer hover:opacity-80 transition-opacity">
                  <AvatarImage src="/workspace-icon.png" alt={currentWorkspace?.name || 'Workspace'} />
                  <AvatarFallback className="bg-white/10">
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
              className="rounded-lg hover:bg-white/10 text-white transition-colors focus-visible:ring-offset-toolbar"
            >
              <Home className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Home</p>
          </TooltipContent>
        </Tooltip>

        <div className="flex-1 border-t border-white/20 my-2 w-8" />

        {/* CreateNewButton */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleCreateNew}
              disabled={loading}
              className="rounded-lg hover:bg-white/10 text-white transition-colors focus-visible:ring-offset-toolbar"
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="p-0 h-auto hover:bg-white/10 text-white focus-visible:ring-offset-toolbar"
              >
                <Avatar className="h-8 w-8 cursor-pointer hover:opacity-80 transition-opacity">
                  <AvatarImage 
                    src={user?.profilePicture || "/user-avatar.png"} 
                    alt={user?.displayName || 'User'} 
                  />
                  <AvatarFallback className="bg-white/10">
                    {user?.displayName?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80 p-2">
              <div className="flex items-start gap-2 mb-2">
                <Avatar className="h-10 w-10">
                  <AvatarImage 
                    src={user?.profilePicture || "/user-avatar.png"} 
                    alt={user?.displayName || 'User'} 
                  />
                  <AvatarFallback>
                    {user?.displayName?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="font-bold">{user?.displayName}</p>
                    {user?.statusMessage && (
                      <>
                        <span className="text-muted-foreground">|</span>
                        <p className="text-sm text-muted-foreground">{user.statusMessage}</p>
                      </>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{user?.email}</p>
                </div>
              </div>
              <div className="flex gap-2 mb-2" onKeyDown={(e) => e.stopPropagation()}>
                <Input 
                  placeholder="Set a status" 
                  value={statusInput}
                  onChange={(e) => setStatusInput(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleStatusUpdate();
                    }
                  }}
                  disabled={isUpdatingStatus}
                />
                <Button 
                  size="icon" 
                  variant="ghost"
                  onClick={handleStatusUpdate}
                  disabled={isUpdatingStatus}
                  className="shrink-0"
                >
                  <Check className="h-4 w-4" />
                </Button>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                className="gap-2 cursor-pointer" 
                onClick={() => setIsUserSettingsOpen(true)}
              >
                <User className="h-4 w-4" />
                User Settings
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="gap-2 cursor-pointer" 
                onClick={() => setIsPreferencesOpen(true)}
              >
                <Settings className="h-4 w-4" />
                Preferences
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 cursor-pointer" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <TooltipContent side="right">
            <p>{user?.displayName || 'User'}</p>
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

      {/* Add PreferencesOverlay */}
      <PreferencesOverlay
        open={isPreferencesOpen}
        onOpenChange={setIsPreferencesOpen}
      />

      {/* Add UserSettingsDialog */}
      <UserSettingsDialog
        open={isUserSettingsOpen}
        onOpenChange={setIsUserSettingsOpen}
      />
    </div>
  );
}