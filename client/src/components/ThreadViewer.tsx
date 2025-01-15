import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessageDisplayArea } from "./MessageDisplayArea";
import { MessageInput } from "./chat/MessageInput";
import { Message } from "@/types/message";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/hooks/useWebSocket";
import { WebSocketMessageEvent } from "@/types/websocket";
import { useAppSelector } from "@/store";

interface ThreadViewerProps {
  messageId: number;
  workspaceId: number;
  channelId: number;
  onClose: () => void;
}

export function ThreadViewer({ messageId, workspaceId, channelId, onClose }: ThreadViewerProps) {
  const queryClient = useQueryClient();
  const [realtimeReplies, setRealtimeReplies] = useState<Message[]>([]);
  const { user } = useAppSelector((state) => state.auth);

  // Fetch the parent message
  const { data: parentMessage } = useQuery<Message>({
    queryKey: [`/api/v1/messages/${messageId}`],
    enabled: Boolean(messageId),
  });

  // Fetch thread replies
  const { data: threadReplies = [] } = useQuery<Message[]>({
    queryKey: [`/api/v1/messages/${messageId}/thread`],
    enabled: Boolean(messageId),
  });

  // Handle WebSocket message events for thread replies
  const handleMessageEvent = useCallback((event: WebSocketMessageEvent) => {
    console.log("ThreadViewer received message event:", {
      type: event.type,
      userId: event.data.userId,
      currentUserId: user?.id,
      identifier: event.data.identifier,
      messageId: event.data.messageId,
      parentMessageId: event.data.parentMessageId
    });

    if (
      event.type === "MESSAGE_CREATED" && 
      event.data.channelId === channelId &&
      event.data.parentMessageId === messageId
    ) {
      // If this is our own message with an identifier, update the optimistic message
      if (event.data.userId === user?.id && event.data.identifier) {
        console.log("Updating optimistic thread reply:", {
          identifier: event.data.identifier,
          newMessageId: event.data.messageId
        });

        queryClient.setQueryData<Message[]>(
          [`/api/v1/messages/${messageId}/thread`],
          (old = []) => {
            const updated = old?.map(msg => 
              msg.messageId === event.data.identifier 
                ? {
                    ...msg,
                    messageId: event.data.messageId,
                    createdAt: event.data.createdAt,
                    updatedAt: event.data.createdAt,
                    postedAt: event.data.createdAt
                  }
                : msg
            ) || [];
            console.log("Thread messages after update:", updated);
            return updated;
          }
        );
        return;
      }

      // For messages from other users, proceed with normal handling
      if (event.data.userId !== user?.id) {
        const newMessage: Message = {
          messageId: event.data.messageId,
          channelId: event.data.channelId,
          workspaceId: event.data.workspaceId,
          userId: event.data.userId,
          content: event.data.content,
          postedAt: event.data.createdAt,
          createdAt: event.data.createdAt,
          updatedAt: event.data.createdAt,
          deleted: false,
          parentMessageId: event.data.parentMessageId,
          user: {
            userId: event.data.user.userId,
            displayName: event.data.user.displayName,
            profilePicture: event.data.user.profilePicture
          }
        };

        // Check if the message already exists in either threadReplies or realtimeReplies
        const messageExists = threadReplies.some(msg => msg.messageId === newMessage.messageId) ||
                            realtimeReplies.some(msg => msg.messageId === newMessage.messageId);

        if (!messageExists) {
          setRealtimeReplies(prev => [...prev, newMessage]);
        }
      }
    }
  }, [channelId, messageId, threadReplies, realtimeReplies, user?.id, queryClient]);

  // Setup WebSocket connection
  useWebSocket({
    workspaceId,
    onMessageEvent: handleMessageEvent,
  });

  // Clear realtime replies when thread changes
  useEffect(() => {
    setRealtimeReplies([]);
  }, [messageId]);

  // Combine parent message with replies and sort by timestamp
  const allMessages = parentMessage 
    ? [
        parentMessage, 
        ...threadReplies, 
        ...realtimeReplies
      ].sort((a, b) => new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime())
    : [];

  return (
    <div className={cn(
      "flex flex-col h-full",
      "border-l bg-background",
      "w-[400px]"
    )}>
      {/* Thread Header */}
      <div className="flex-none h-14 min-h-[3.5rem] border-b px-4 flex items-center justify-between bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <h2 className="font-semibold">Thread</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Thread Messages */}
      <MessageDisplayArea 
        messages={allMessages} 
        isInThread={true}
      />

      {/* Message Input */}
      <MessageInput 
        channelId={channelId}
        workspaceId={workspaceId}
        parentMessageId={messageId}
      />
    </div>
  );
} 