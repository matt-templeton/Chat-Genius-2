import { useQuery } from "@tanstack/react-query";
import { useAppSelector } from "@/store";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Hash, Lock, ChevronRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Channel {
  channelId: number;
  name: string;
  topic: string | null;
  workspaceId: number;
  channelType: 'PUBLIC' | 'PRIVATE' | 'DM';
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export function ChannelList() {
  const [isExpanded, setIsExpanded] = useState(true);
  const currentWorkspace = useAppSelector(state => state.workspace.currentWorkspace);

  const { data: channels = [], isLoading } = useQuery<Channel[]>({
    queryKey: [`/api/v1/workspaces/${currentWorkspace?.workspaceId}/channels`],
    enabled: !!currentWorkspace?.workspaceId,
  });

  if (!currentWorkspace) {
    return (
      <div className="px-3 py-2 text-sm text-muted-foreground">
        Select a workspace to view channels
      </div>
    );
  }

  if (isLoading) {
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
              <DropdownMenuItem>Create channel</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Channel List */}
      {isExpanded && activeChannels.map((channel) => (
        <Button
          key={channel.channelId}
          variant="ghost"
          size="sm"
          className={cn(
            "w-full justify-start px-2 gap-2",
            "hover:bg-accent hover:text-accent-foreground"
          )}
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