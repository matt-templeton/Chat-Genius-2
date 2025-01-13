import { ChannelList } from "./ChannelList";

export function ChatsSidebar() {
  return (
    <div className="h-full flex flex-col">
      {/* Channels section */}
      <div className="flex-1">
        <ChannelList />
      </div>

      {/* Direct Messages section */}
      <div className="mt-6 space-y-2 p-4 border-t">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Direct Messages</h2>
        </div>
        <div className="text-sm text-muted-foreground">
          Direct messages coming soon
        </div>
      </div>
    </div>
  );
}