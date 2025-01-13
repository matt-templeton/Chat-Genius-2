/**
 * ChatArea Component
 * Main chat interface that displays messages and handles interactions like
 * threading, pinning, and reactions. Supports soft-deleted messages.
 */
import { useEffect, useRef } from "react";
import { useAppSelector, useAppDispatch } from "@/store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import MessageList from "./MessageList";
import MessageInputBox from "./MessageInputBox";
import ThreadView from "./ThreadView";
import { useQuery } from "@tanstack/react-query";

export function ChatArea() {
  const dispatch = useAppDispatch();
  const { currentChannel } = useAppSelector((state) => state.channel);
  const { currentWorkspace } = useAppSelector((state) => state.workspace);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch messages for the current channel
  const {
    data: messages,
    isLoading,
    error,
  } = useQuery({
    queryKey: [`/api/v1/channels/${currentChannel?.channelId}/messages`],
    enabled: !!currentChannel?.channelId,
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!currentWorkspace || !currentChannel) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">
          Select a channel to start chatting
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-destructive">Failed to load messages</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Card className="flex-1 border-0 rounded-none">
        <ScrollArea className="h-full">
          <div className="p-4">
            <MessageList messages={messages || []} />
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </Card>
      <MessageInputBox channelId={currentChannel.channelId} />
    </div>
  );
}

export default ChatArea;
