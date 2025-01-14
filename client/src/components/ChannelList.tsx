import { useAppSelector, useAppDispatch } from "@/store";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Hash, Lock, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useLocation } from "wouter";
import { ChannelCreateDialog } from "./ChannelCreateDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  handleChannelCreated, 
  handleChannelUpdated, 
  handleChannelArchived,
  fetchChannels,
  setCurrentChannel
} from "@/store/channelSlice";

export function ChannelList() {
  const [isExpanded, setIsExpanded] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const dispatch = useAppDispatch();
  const [, setLocation] = useLocation();

  const currentWorkspace = useAppSelector(state => state.workspace.currentWorkspace);
  const { channels, loading, currentChannel } = useAppSelector(state => state.channel);

  // Memoize the WebSocket event handler
  const handleWebSocketEvent = useCallback((event: any) => {
    if (!currentWorkspace) return;

    switch (event.type) {
      case 'CHANNEL_CREATED':
        if (event.workspaceId === currentWorkspace.workspaceId) {
          dispatch(handleChannelCreated(event.channel));
        }
        break;
      case 'CHANNEL_UPDATED':
        if (event.workspaceId === currentWorkspace.workspaceId) {
          dispatch(handleChannelUpdated(event.channel));
        }
        break;
      case 'CHANNEL_ARCHIVED':
        if (event.workspaceId === currentWorkspace.workspaceId) {
          dispatch(handleChannelArchived(event.channel.id));
        }
        break;
    }
  }, [currentWorkspace, dispatch]);

  // Setup WebSocket connection
  useWebSocket({
    workspaceId: currentWorkspace?.workspaceId || 0,
    onChannelEvent: handleWebSocketEvent,
  });

  // Fetch channels when workspace changes
  useEffect(() => {
    if (currentWorkspace?.workspaceId) {
      dispatch(fetchChannels({ 
        workspaceId: currentWorkspace.workspaceId, 
        showArchived: false 
      }));
    }
  }, [currentWorkspace?.workspaceId, dispatch]);

  // Set default channel (general) when channels are loaded
  useEffect(() => {
    if (channels.length > 0 && !currentChannel) {
      const generalChannel = channels.find(c => c.name.toLowerCase() === 'general') || channels[0];
      if (generalChannel) {
        dispatch(setCurrentChannel(generalChannel));
        setLocation(`/chat/${currentWorkspace?.workspaceId}/${generalChannel.channelId}`);
      }
    }
  }, [channels, currentChannel, currentWorkspace?.workspaceId, dispatch, setLocation]);


  const handleChannelSelect = (channelId: number) => {
    const selectedChannel = channels.find(c => c.channelId === channelId);
    if (selectedChannel) {
      dispatch(setCurrentChannel(selectedChannel));
      setLocation(`/chat/${currentWorkspace?.workspaceId}/${channelId}`);
    }
  };

  if (!currentWorkspace) {
    return (
      <div className="px-3 py-2 text-sm text-muted-foreground">
        Select a workspace to view channels
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-[70%]" />
        <Skeleton className="h-4 w-[80%]" />
        <Skeleton className="h-4 w-[60%]" />
      </div>
    );
  }

  const activeChannels = channels.filter(channel => !channel.archived);

  return (
    <div className="space-y-1 p-3">
      {/* Channel Header */}
      <div className="flex items-center justify-between mb-2 px-2">
        <div className="flex items-center gap-1">
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm"
                className="h-auto p-0 font-semibold text-sm hover:bg-transparent"
              >
                Channels
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem>Browse channels</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCreateDialogOpen(true)}>
                Create channel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Channel Create Dialog */}
      <ChannelCreateDialog
        workspaceId={currentWorkspace.workspaceId}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      {/* Channel List */}
      {isExpanded && activeChannels.map((channel) => (
        <Button
          key={channel.channelId}
          variant="ghost"
          size="sm"
          className={cn(
            "w-full justify-start px-2 gap-2",
            "hover:bg-accent hover:text-accent-foreground",
            currentChannel?.channelId === channel.channelId && "bg-accent/50"
          )}
          onClick={() => handleChannelSelect(channel.channelId)}
        >
          {channel.channelType === 'PRIVATE' ? (
            <Lock className="h-4 w-4" />
          ) : (
            <Hash className="h-4 w-4" />
          )}
          <span className="truncate">{channel.name}</span>
        </Button>
      ))}
      {isExpanded && activeChannels.length === 0 && (
        <div className="px-2 py-1.5 text-sm text-muted-foreground">
          No channels found
        </div>
      )}
    </div>
  );
}