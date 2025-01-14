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

interface WebSocketChannelEvent {
  type: "CHANNEL_CREATED" | "CHANNEL_UPDATED" | "CHANNEL_ARCHIVED";
  workspaceId: number;
  data: {
    channelId: number;
    name: string;
    channelType: 'PUBLIC' | 'PRIVATE' | 'DM';
    workspaceId: number;
    // Add other channel properties as needed
  };
}

// Add interface for channel member
interface ChannelMember {
  userId: number;
  displayName: string;
}

const useCurrentUser = () => {
  return parseInt(localStorage.getItem('userId') || '0');
};

export function DirectMessagesList() {
  const [isExpanded, setIsExpanded] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const dispatch = useAppDispatch();
  const [, setLocation] = useLocation();

  const currentWorkspace = useAppSelector(state => state.workspace.currentWorkspace);
  const { dms = [], loading, currentChannel } = useAppSelector(state => state.channel);
  const currentUserId = useCurrentUser();
  const [channelMembers, setChannelMembers] = useState<Record<number, ChannelMember[]>>({});

  // Memoize the WebSocket event handler
  const handleWebSocketEvent = useCallback((event: WebSocketChannelEvent) => {
    if (!currentWorkspace) return;

    switch (event.type) {
      case "CHANNEL_CREATED":
        if (
          event.workspaceId === currentWorkspace.workspaceId && 
          event.data?.channelType === 'DM'
        ) {
          dispatch(handleDirectMessageCreated(event.data));
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

  // Add function to fetch channel members
  const fetchChannelMembers = async (channelId: number) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/v1/channels/${channelId}/members`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch channel members');
      }

      const members = await response.json();
      setChannelMembers(prev => ({
        ...prev,
        [channelId]: members
      }));
    } catch (error) {
      console.error(`Error fetching members for channel ${channelId}:`, error);
    }
  };

  // Fetch members for each DM channel
  useEffect(() => {
    dms.forEach(dm => {
      if (!channelMembers[dm.channelId]) {
        fetchChannelMembers(dm.channelId);
      }
    });
  }, [dms]);

  // Helper function to get other participant's name
  const getOtherParticipantName = (channelId: number): string => {
    const members = channelMembers[channelId] || [];
    if (members.length === 0) {
      return "Loading...";
    }

    const otherMember = members.find(member => member.userId !== currentUserId);
    if (!otherMember) {
      return "No participants";
    }

    return otherMember.displayName;
  };

  // Helper function to get avatar letter
  const getAvatarLetter = (channelId: number): string => {
    const name = getOtherParticipantName(channelId);
    return name === "Loading..." || name === "No participants" 
      ? "?" 
      : name[0].toUpperCase();
  };

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
        <TooltipProvider key={`dm-${dm.channelId}`}>
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
                    {getAvatarLetter(dm.channelId)}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">
                  {getOtherParticipantName(dm.channelId)}
                </span>
                {dm.lastMessage && (
                  <span className="ml-auto text-xs text-muted-foreground truncate">
                    {dm.lastMessage}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" align="center">
              View conversation with {getOtherParticipantName(dm.channelId)}
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