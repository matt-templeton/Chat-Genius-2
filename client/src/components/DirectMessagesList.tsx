/**
 * DirectMessagesList Component
 * Lists direct or multi-user DMs. Each item references a DM channel.
 */
import { useAppDispatch, useAppSelector } from "@/store";
import { setCurrentChannel } from "@/store/channelSlice";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { AvatarFallback } from "@radix-ui/react-avatar";

/**
 * DmEntry Component
 * Represents a single DM conversation
 */
function DmEntry({ 
  channelId, 
  name, 
  isActive, 
  onClick 
}: { 
  channelId: number; 
  name: string; 
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      onClick={onClick}
      variant={isActive ? "secondary" : "ghost"}
      className="w-full justify-start font-normal"
    >
      <Avatar className="h-6 w-6 mr-2">
        <AvatarFallback>{name[0].toUpperCase()}</AvatarFallback>
      </Avatar>
      {name}
    </Button>
  );
}

/**
 * NewDmButton Component
 * Opens an overlay to start a new DM
 */
function NewDmButton({ onNewDm }: { onNewDm: (participantIds: number[]) => void }) {
  const [isOpen, setIsOpen] = useState(false);

  const handleCreateDm = () => {
    // This would typically show a user selection UI
    // For now, we'll just simulate creating a DM with a hardcoded user ID
    onNewDm([2]); // Example: Create DM with user ID 2
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="w-full justify-start">
          <Plus className="h-4 w-4 mr-2" />
          Start New DM
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a New Direct Message</DialogTitle>
        </DialogHeader>
        <div className="p-4">
          <Button onClick={handleCreateDm}>Create DM</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DirectMessagesList() {
  const dispatch = useAppDispatch();
  const { channels, currentChannel, loading, error } = useAppSelector((state) => state.channel);
  const { currentWorkspace } = useAppSelector((state) => state.workspace);

  // Filter to show only DM channels that aren't archived
  const dmChannels = channels?.filter(
    (channel) => channel?.channelType === "DM" && !channel?.archived
  ) || [];

  const handleSelectDM = (channelId: number) => {
    const channel = channels?.find((c) => c.channelId === channelId);
    if (channel) {
      dispatch(setCurrentChannel(channel));
    }
  };

  const handleNewDm = (participantIds: number[]) => {
    // This would typically dispatch an action to create a new DM channel
    console.log('Creating new DM with participants:', participantIds);
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-destructive">
          Error loading messages: {error}
        </p>
      </div>
    );
  }

  if (!currentWorkspace) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">
          Select a workspace to view messages
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-4">
      <div className="px-3 py-2">
        <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
          Direct Messages
        </h2>
        <NewDmButton onNewDm={handleNewDm} />
      </div>

      <ScrollArea className="h-[300px]">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">Loading messages...</p>
          </div>
        ) : dmChannels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <p className="text-sm text-muted-foreground">No direct messages yet</p>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {dmChannels.map((channel) => (
              <DmEntry
                key={channel.channelId}
                channelId={channel.channelId}
                name={channel.name}
                isActive={currentChannel?.channelId === channel.channelId}
                onClick={() => handleSelectDM(channel.channelId)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export default DirectMessagesList;