import { useState, useEffect, useCallback } from "react";
import { useAppSelector, useAppDispatch } from "@/store";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DirectMessageCreateDialog } from "./DirectMessageCreateDialog";
import { fetchDirectMessages, handleDirectMessageCreated, setCurrentChannel } from "@/store/channelSlice";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

export function DirectMessagesList() {
  const [isExpanded, setIsExpanded] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const dispatch = useAppDispatch();
  const [, setLocation] = useLocation();

  const currentWorkspace = useAppSelector(state => state.workspace.currentWorkspace);
  const { dms = [], loading, currentChannel } = useAppSelector(state => state.channel);

  // Memoize the WebSocket event handler
  const handleWebSocketEvent = useCallback((event: any) => {
    if (!currentWorkspace) return;

    switch (event.type) {
      case 'CHANNEL_CREATED':
        if (event.workspaceId === currentWorkspace.workspaceId && event.channel.channelType === 'DM') {
          dispatch(handleDirectMessageCreated(event.channel));
        }
        break;
    }
  }, [currentWorkspace, dispatch]);

  // Setup WebSocket connection
  useWebSocket({
    workspaceId: currentWorkspace?.workspaceId || 0,
    onChannelEvent: handleWebSocketEvent,
  });

  // Fetch DMs when workspace changes
  useEffect(() => {
    if (currentWorkspace?.workspaceId) {
      dispatch(fetchDirectMessages({ workspaceId: currentWorkspace.workspaceId }));
    }
  }, [currentWorkspace?.workspaceId, dispatch]);

  const handleDmSelect = (channelId: number) => {
    const selectedDm = dms.find(dm => dm.channelId === channelId);
    if (selectedDm) {
      dispatch(setCurrentChannel(selectedDm));
      setLocation(`/chat/${currentWorkspace?.workspaceId}/${channelId}`);
    }
  };

  if (!currentWorkspace) {
    return (
      <div className="px-3 py-2 text-sm text-muted-foreground">
        Select a workspace to view messages
      </div>
    );
  }

  return (
    <div className="space-y-1 p-3">
      {/* DM List Header */}
      <div className="flex items-center justify-between mb-2 px-2">
        <div className="flex items-center gap-1">
          {/* DMHeaderChevron */}
          <Button
            variant="ghost"
            size="icon"
            className="h-4 w-4 p-0 hover:bg-transparent"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>

          {/* DMDropdownButton */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm"
                className="h-auto p-0 font-semibold text-sm hover:bg-transparent"
              >
                Direct Messages
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem>Browse DMs</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCreateDialogOpen(true)}>
                Start new conversation
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* New DM Button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 p-1"
          onClick={() => setCreateDialogOpen(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* DM Create Dialog */}
      <DirectMessageCreateDialog
        workspaceId={currentWorkspace.workspaceId}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      {/* DM List */}
      {isExpanded && dms.map((dm) => (
        <TooltipProvider key={dm.channelId}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "w-full justify-start px-2 gap-2",
                  "hover:bg-accent hover:text-accent-foreground",
                  currentChannel?.channelId === dm.channelId && "bg-accent/50"
                )}
                onClick={() => handleDmSelect(dm.channelId)}
              >
                <Avatar className="h-6 w-6">
                  <AvatarFallback>
                    {dm.participants?.[0]?.charAt(0).toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">
                  {dm.participants?.join(", ") || "No participants"}
                </span>
                {dm.lastMessage && (
                  <span className="ml-auto text-xs text-muted-foreground truncate">
                    {dm.lastMessage}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" align="center">
              View conversation with {dm.participants?.join(", ") || "No participants"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ))}

      {isExpanded && dms.length === 0 && (
        <div className="px-2 py-1.5 text-sm text-muted-foreground">
          No direct messages yet
        </div>
      )}
    </div>
  );
}