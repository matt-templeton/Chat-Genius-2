/**
 * DirectMessagesList Component
 * Displays a list of direct message channels in the current workspace.
 * Reuses channel state from Redux but filters to show only DM-type channels.
 */
import { useAppDispatch, useAppSelector } from "@/store";
import { setCurrentChannel } from "@/store/channelSlice";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare } from "lucide-react";

export function DirectMessagesList() {
  const dispatch = useAppDispatch();
  const { channels, currentChannel } = useAppSelector((state) => state.channel);
  const { currentWorkspace } = useAppSelector((state) => state.workspace);

  // Filter to show only DM channels that aren't archived
  const dmChannels = channels.filter(
    (channel) => channel.channelType === "DM" && !channel.archived
  );

  const handleSelectDM = (channelId: number) => {
    const channel = channels.find((c) => c.channelId === channelId);
    if (channel) {
      dispatch(setCurrentChannel(channel));
    }
  };

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
      </div>

      <ScrollArea className="h-[calc(100vh-16rem)]">
        {dmChannels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <p className="text-sm text-muted-foreground">No direct messages yet</p>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {dmChannels.map((channel) => (
              <Button
                key={`dm-${channel.channelId}`}
                onClick={() => handleSelectDM(channel.channelId)}
                variant={
                  currentChannel?.channelId === channel.channelId
                    ? "secondary"
                    : "ghost"
                }
                className="w-full justify-start font-normal"
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                {channel.name}
              </Button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export default DirectMessagesList;
