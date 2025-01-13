import { ChannelList } from "./ChannelList";
import { ScrollArea } from "@/components/ui/scroll-area";

export function ChatsSidebar() {
  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col h-full">
        {/* Channels section */}
        <div>
          <ChannelList />
        </div>

        {/* Direct Messages section */}
        <div className="space-y-2 p-4 border-t">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Direct Messages</h2>
          </div>
          <div className="text-sm text-muted-foreground">
            Direct messages coming soon
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}