import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/useWebSocket";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Paperclip, Smile, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";
import { useAppDispatch } from "@/store";
import { createMessage } from "@/store/messageSlice";
import { Message } from "@/types/message";
import { useToast } from "@/hooks/use-toast";

// interface Message {
//   messageId: number;
//   content: string;
//   userId: number;
//   channelId: number;
//   postedAt: string;
//   deleted?: boolean;
//   workspaceId: number;
//   createdAt: string;
//   updatedAt: string;
// }

interface Channel {
  channelId: number;
  name: string;
  description?: string;
  workspaceId: number;
  topic?: string;
  channelType: 'PUBLIC' | 'PRIVATE' | 'DM';
  archived: boolean;
}

interface WebSocketMessageEvent {
  type: "MESSAGE_CREATED";
  workspaceId: number;
  data: {
    channelId: number;
    messageId: number;
    content: string;
    userId: number;
    workspaceId: number;
    createdAt: string;
  };
}

export function ChatArea() {
  const { workspaceId = "", channelId = "" } = useParams();
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dispatch = useAppDispatch();
  const [realtimeMessages, setRealtimeMessages] = useState<Message[]>([]);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch channel details
  const { data: channel } = useQuery<Channel>({
    queryKey: [`/api/v1/channels/${channelId}`],
    enabled: Boolean(channelId),
  });

  // Fetch messages
  const { data: fetchedMessages = [] } = useQuery<Message[]>({
    queryKey: [`/api/v1/channels/${channelId}/messages`],
    enabled: Boolean(channelId),
  });

  // Combine and sort messages by postedAt
  const messages = [...fetchedMessages, ...realtimeMessages].sort(
    (a, b) => new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime()
  );

  // Add messageIdsRef to track processed messages
  const processedMessageIds = useRef<Set<number>>(new Set());

  // Move the message existence check to a ref to avoid dependencies on messages
  const existingMessageIds = useRef(new Set<number>());
  
  // Update existingMessageIds when messages change
  useEffect(() => {
    existingMessageIds.current = new Set(messages.map(m => m.messageId));
  }, [messages]);

  // Memoize the channel event handler
  const handleChannelEvent = useCallback((event: any) => {
    if (event.type === "CHANNEL_CREATED" || event.type === "CHANNEL_UPDATED" || event.type === "CHANNEL_ARCHIVED") {
      if (event.data.id === parseInt(channelId)) {
        queryClient.invalidateQueries({
          queryKey: [`/api/v1/channels/${channelId}/messages`],
          exact: true
        });
      }
    }
  }, [channelId, queryClient]);

  // Memoize the message event handler
  const handleMessageEvent = useCallback((event: WebSocketMessageEvent) => {
    console.log("WebSocket message event received:", event);
    
    if (
      event.type === "MESSAGE_CREATED" && 
      event.data.channelId === parseInt(channelId) && 
      event.workspaceId === parseInt(workspaceId)
    ) {
      console.log("Message event matches current channel:", {
        eventChannelId: event.data.channelId,
        currentChannelId: parseInt(channelId),
        eventWorkspaceId: event.workspaceId,
        currentWorkspaceId: parseInt(workspaceId)
      });

      // Check if we've already processed this message
      if (processedMessageIds.current.has(event.data.messageId)) {
        console.log("Message already processed, skipping:", event.data.messageId);
        return;
      }

      // Add message ID to processed set
      processedMessageIds.current.add(event.data.messageId);
      console.log("Added message ID to processed set:", event.data.messageId);
      
      const newMessage: Message = {
        messageId: event.data.messageId,
        channelId: event.data.channelId,
        workspaceId: event.data.workspaceId,
        userId: event.data.userId,
        content: event.data.content,
        postedAt: event.data.createdAt,
        createdAt: event.data.createdAt,
        updatedAt: event.data.createdAt,
        deleted: false
      };

      // Check if message exists using the ref instead of messages array
      if (!existingMessageIds.current.has(newMessage.messageId)) {
        console.log("Adding new message to realtime messages:", newMessage);
        setRealtimeMessages(prev => [...prev, newMessage]);
      } else {
        console.log("Message already exists in existingMessageIds:", newMessage.messageId);
      }
    } else {
      console.log("Message event did not match criteria:", {
        type: event.type,
        channelMatch: event.data?.channelId === parseInt(channelId),
        workspaceMatch: event.workspaceId === parseInt(workspaceId)
      });
    }
  }, [channelId, workspaceId]);

  // Setup WebSocket connection
  const { send } = useWebSocket({
    workspaceId: parseInt(workspaceId),
    onChannelEvent: handleChannelEvent,
    onMessageEvent: handleMessageEvent,
  });

  // Clear processed message IDs when channel changes
  useEffect(() => {
    setRealtimeMessages([]);
    processedMessageIds.current.clear();
  }, [channelId]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    try {
      const result = await dispatch(createMessage({ 
        channelId: parseInt(channelId),
        content: message 
      })).unwrap();

      setMessage("");
      processedMessageIds.current.add(result.messageId);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      });
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
    <div className="flex flex-col h-full">
      {/* ChannelHeader */}
      <div className="flex-none h-14 min-h-[3.5rem] border-b px-4 flex items-center justify-between bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
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
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full px-4">
          <div className="py-4 space-y-4">
            {messages.map((msg) => (
              <div key={msg.messageId} className="group flex items-start space-x-3 hover:bg-accent/5 rounded-lg p-2 -mx-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  {/* Placeholder for user avatar */}
                  <span className="text-xs font-medium">U</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium">User {msg.userId}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(msg.postedAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm mt-1 break-words">{msg.content}</p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </div>

      {/* MessageInput */}
      <div className="flex-none border-t p-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
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