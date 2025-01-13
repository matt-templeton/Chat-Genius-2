export function ChatsSidebar() {
  return (
    <div className="h-full flex flex-col p-4">
      {/* ChannelList placeholder */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Channels</h2>
        </div>
        {/* Channel items will go here */}
      </div>

      {/* DirectMessagesList placeholder */}
      <div className="mt-6 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Direct Messages</h2>
        </div>
        {/* DM items will go here */}
      </div>
    </div>
  );
}
