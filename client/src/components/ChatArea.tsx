export function ChatArea() {
  return (
    <div className="h-full flex flex-col">
      {/* ChannelHeader placeholder */}
      <div className="h-14 border-b px-4 flex items-center">
        <h1 className="font-semibold">Channel Name</h1>
      </div>

      {/* Message Display Area */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Messages will go here */}
      </div>

      {/* MessageInput placeholder */}
      <div className="border-t p-4">
        <div className="bg-muted rounded-lg p-2">
          <input
            type="text"
            placeholder="Type a message..."
            className="w-full bg-transparent outline-none"
          />
        </div>
      </div>
    </div>
  );
}
