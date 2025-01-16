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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Channel as ChannelType } from "@/types/channel";
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
  profilePicture: string | null;
  displayName: string;
}

interface DmChannel extends ChannelType {
  otherParticipants?: Array<{
    userId: number;
    displayName: string;
    profilePicture: string | null;
  }>;
}

const useCurrentUser = () => {
  return parseInt(localStorage.getItem('userId') || '0');
};

export function DirectMessagesList() {
  const [isExpanded, setIsExpanded] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const dispatch = useAppDispatch();
  const [, setLocation] = useLocation();
  const { user } = useAppSelector(state => state.auth);

  const currentWorkspace = useAppSelector(state => state.workspace.currentWorkspace);
  const { dms = [], loading, currentChannel } = useAppSelector(state => state.channel);
  const [enrichedDms, setEnrichedDms] = useState<DmChannel[]>([]);

  // Fetch channel members for a DM
  const fetchChannelMembers = useCallback(async (channelId: number) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/v1/channels/${channelId}/members`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        console.log(response)
        throw new Error('Failed to fetch channel members, status: ' + response.status + " " + response.statusText);
      }

      const members: ChannelMember[] = await response.json();
      return members;
    } catch (error) {
      console.error(`Error fetching members for channel ${channelId}:`, error);
      return null;
    }
  }, []);

  // Update DMs with other participant info
  useEffect(() => {
    const enrichDms = async () => {
      if (!user) {
        console.log('No user found in DirectMessagesList:', user);
        return;
      }

      const enrichedChannels = await Promise.all(
        dms.map(async (dm) => {
          const members = await fetchChannelMembers(dm.channelId);
          if (!members) return dm;

          const otherParticipants = members.filter(member => {
            const isCurrentUser = member.userId === user.userId;
            return !isCurrentUser;
          });

          return {
            ...dm,
            otherParticipants
          };
        })
      );

      setEnrichedDms(enrichedChannels);
    };

    enrichDms();
  }, [dms, user, fetchChannelMembers]);

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

  // // Setup WebSocket connection
  // useWebSocket({
  //   workspaceId: currentWorkspace?.workspaceId || 0,
  //   onChannelEvent: handleWebSocketEvent,
  // });

  // Fetch DMs when workspace changes
  useEffect(() => {
    if (currentWorkspace?.workspaceId) {
      dispatch(fetchDirectMessages({ workspaceId: currentWorkspace.workspaceId }));
    }
  }, [currentWorkspace?.workspaceId, dispatch]);

  const handleDmSelect = (channelId: number) => {
    const selectedDm = enrichedDms.find(dm => dm.channelId === channelId);
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
      {isExpanded && enrichedDms.map((dm) => (
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
                  <AvatarImage 
                    src={dm.otherParticipants?.[0]?.profilePicture || "/user-avatar.png"}
                    alt={dm.otherParticipants?.[0]?.displayName || "User"}
                  />
                  <AvatarFallback>
                    {dm.otherParticipants?.[0]?.displayName?.[0]?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">
                  {dm.otherParticipants
                    ?.filter(p => p.userId !== user?.userId)
                    ?.map(p => p.displayName)
                    .join(', ') || "Loading..."}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" align="center">
              View conversation with {dm.otherParticipants
                ?.filter(p => p.userId !== user?.userId)
                ?.map(p => p.displayName)
                .join(', ') || "Loading..."}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ))}

      {isExpanded && enrichedDms.length === 0 && (
        <div className="px-2 py-1.5 text-sm text-muted-foreground">
          No direct messages yet
        </div>
      )}
    </div>
  );
}