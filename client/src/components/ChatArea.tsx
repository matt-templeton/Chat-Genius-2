import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/useWebSocket";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Paperclip, Smile, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";

interface Message {
  id: number;
  content: string;
  userId: number;
  channelId: number;
  createdAt: string;
}

interface Channel {
  id: number;
  name: string;
  description: string;
  workspaceId: number;
}

export function ChatArea() {
  const { workspaceId = "", channelId = "" } = useParams();
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch channel details
  const { data: channel } = useQuery<Channel>({
    queryKey: [`/api/v1/workspaces/${workspaceId}/channels/${channelId}`],
    enabled: Boolean(workspaceId && channelId),
  });

  // Fetch messages
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: [`/api/v1/workspaces/${workspaceId}/channels/${channelId}/messages`],
    enabled: Boolean(workspaceId && channelId),
  });

  // WebSocket integration for real-time updates
  const { send } = useWebSocket({
    workspaceId: parseInt(workspaceId),
    onChannelEvent: (event) => {
      if (event.type === "CHANNEL_CREATED" || event.type === "CHANNEL_UPDATED" || event.type === "CHANNEL_ARCHIVED") {
        // Only invalidate the messages query if it's the current channel
        if (event.channel.id === parseInt(channelId)) {
          void queryClient.invalidateQueries({
            queryKey: [`/api/v1/workspaces/${workspaceId}/channels/${channelId}/messages`],
          });
        }
      }
    },
  });

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/channels/${channelId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content: message }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      setMessage("");

      // Invalidate messages query after successful send
      void queryClient.invalidateQueries({
        queryKey: [`/api/v1/workspaces/${workspaceId}/channels/${channelId}/messages`],
      });
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  if (!channelId) {
    return (
      <div className="h-full flex items-center justify-center bg-background text-muted-foreground">
        <p>Select a channel to start messaging</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* ChannelHeader */}
      <div className="h-14 border-b px-4 flex items-center justify-between bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center space-x-2">
          <h1 className="font-semibold"># {channel?.name || "Loading..."}</h1>
          {channel?.description && (
            <>
              <Separator orientation="vertical" className="h-4" />
              <span className="text-sm text-muted-foreground">
                {channel.description}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Message Display Area */}
      <ScrollArea className="flex-1 px-4 py-2">
        <div className="space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className="group flex items-start space-x-3 hover:bg-accent/5 rounded-lg p-2 -mx-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                {/* Placeholder for user avatar */}
                <span className="text-xs font-medium">U</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-2">
                  <span className="font-medium">User {msg.userId}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(msg.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-sm mt-1 break-words">{msg.content}</p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* MessageInput */}
      <div className="border-t p-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="relative">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={`Message ${channel?.name ? `#${channel.name}` : ''}`}
            className={cn(
              "pr-24",
              "min-h-10",
              "bg-background"
            )}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              type="button"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              type="button"
            >
              <Smile className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              type="button"
              onClick={handleSendMessage}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}