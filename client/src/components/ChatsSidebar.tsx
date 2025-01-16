import { ChannelList } from "./ChannelList";
import { DirectMessagesList } from "./DirectMessagesList";
import { ScrollArea } from "@/components/ui/scroll-area";

export function ChatsSidebar() {
  return (
    <ScrollArea className="h-full bg-sidebarBg text-sidebarText">
      <div className="flex flex-col h-full">
        {/* Channels section */}
        <div>
          <ChannelList />
        </div>

        {/* Direct Messages section */}
        <div>
          <DirectMessagesList />
        </div>
      </div>
    </ScrollArea>
  );
}