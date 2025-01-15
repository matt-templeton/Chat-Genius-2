import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/useWebSocket";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/store";
import { Message, MessageUser } from "@/types/message";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageDisplayArea } from "./MessageDisplayArea";
import { MessageInput } from "./chat/MessageInput";
import { ThreadViewer } from "./ThreadViewer";
import { WebSocketMessageEvent, WebSocketChannelEvent } from "@/types/websocket";

interface Channel {
  channelId: number;
  name: string;
  description?: string;
  workspaceId: number;
  topic?: string;
  channelType: 'PUBLIC' | 'PRIVATE' | 'DM';
  archived: boolean;
  otherParticipants?: Array<{
    userId: number;
    displayName: string;
    profilePicture: string | null;
  }>;
}

interface DmParticipant {
  userId: number;
  displayName: string;
  profilePicture?: string | null;
}

export function ChatArea() {
  const { workspaceId = "", channelId = "" } = useParams();
  const [realtimeMessages, setRealtimeMessages] = useState<Message[]>([]);
  const queryClient = useQueryClient();
  const { user } = useAppSelector(state => state.auth);
  const [threadMessageId, setThreadMessageId] = useState<number | null>(null);

  // Add messageIdsRef to track processed messages
  const processedMessageIds = useRef<Set<number>>(new Set());

  // Move the message existence check to a ref to avoid dependencies on messages
  const existingMessageIds = useRef(new Set<number>());
  
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

  // Combine and sort messages by postedAt, filtering out thread replies
  const messages = [...fetchedMessages, ...realtimeMessages]
    .filter(msg => !msg.parentMessageId) // Only show top-level messages
    .sort((a, b) => new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime());
  
  // Update existingMessageIds when messages change
  useEffect(() => {
    existingMessageIds.current = new Set(messages.map(m => m.messageId));
  }, [messages]);

  // Memoize the channel event handler
  const handleChannelEvent = useCallback((event: WebSocketChannelEvent) => {
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
    console.log("ChatArea received message event:", {
      type: event.type,
      userId: event.data.userId,
      currentUserId: user?.id,
      identifier: event.data.identifier,
      messageId: event.data.messageId
    });
    
    if (
      event.type === "MESSAGE_CREATED" && 
      event.data.channelId === parseInt(channelId) && 
      event.workspaceId === parseInt(workspaceId)
    ) {
      // Skip thread replies in the main chat area
      if (event.data.parentMessageId) {
        // Only invalidate the thread query if we're viewing that thread
        if (threadMessageId === event.data.parentMessageId) {
          queryClient.invalidateQueries({ 
            queryKey: [`/api/v1/messages/${event.data.parentMessageId}/thread`],
            exact: true 
          });
        }
        return;
      }

      // If this is our own message with an identifier, update the optimistic message
      if (event.data.userId === user?.id && event.data.identifier) {
        console.log("Updating optimistic message:", {
          identifier: event.data.identifier,
          newMessageId: event.data.messageId
        });

        queryClient.setQueryData<Message[]>(
          [`/api/v1/channels/${channelId}/messages`],
          (old = []) => {
            const updated = old.map(msg => 
              msg.messageId === event.data.identifier 
                ? {
                    ...msg,
                    messageId: event.data.messageId,
                    createdAt: event.data.createdAt,
                    updatedAt: event.data.createdAt,
                    postedAt: event.data.createdAt
                  }
                : msg
            );
            console.log("Messages after update:", updated);
            return updated;
          }
        );
        return;
      }

      // For messages from other users, proceed with normal handling
      if (event.data.userId !== user?.id) {
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
          deleted: false,
          parentMessageId: event.data.parentMessageId,
          user: {
            userId: event.data.user.userId,
            displayName: event.data.user.displayName,
            profilePicture: event.data.user.profilePicture
          }
        };

        // Check if message exists using the ref instead of messages array
        if (!existingMessageIds.current.has(newMessage.messageId)) {
          console.log("Adding new message to realtime messages:", newMessage);
          setRealtimeMessages(prev => [...prev, newMessage]);
        } else {
          console.log("Message already exists in existingMessageIds:", newMessage.messageId);
        }
      }
    }
  }, [channelId, workspaceId, queryClient, threadMessageId, user?.id]);

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

  // Add this query for DM participants
  const { data: dmParticipants } = useQuery<DmParticipant[]>({
    queryKey: [`/api/v1/channels/${channelId}/participants`],
    enabled: Boolean(channelId) && channel?.channelType === 'DM',
    queryFn: async () => {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/v1/channels/${channelId}/members`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch DM participants');
      }

      return response.json();
    }
  });

  const otherParticipants = dmParticipants?.filter(p => p.userId !== user?.id) || [];
  const otherParticipantsDisplayNames = otherParticipants.map(p => p.displayName).join(', ');
  const firstParticipantInitial = otherParticipantsDisplayNames[0]?.toUpperCase() || '?';

  if (!channelId) {
    return (
      <div className="h-full flex items-center justify-center bg-background text-muted-foreground">
        <p>Select a channel to start messaging</p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="flex flex-col flex-1">
        {/* ChannelHeader */}
        <div className="flex-none h-14 min-h-[3.5rem] border-b px-4 flex items-center justify-between bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="flex items-center space-x-2">
            {channel?.channelType === 'DM' ? (
              // DM Header
              <h1 className="font-semibold flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarFallback>
                    {firstParticipantInitial}
                  </AvatarFallback>
                </Avatar>
                <span>
                  {otherParticipantsDisplayNames || 'Direct Message'}
                </span>
              </h1>
            ) : (
              // Regular Channel Header
              <>
                <h1 className="font-semibold flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  <span>{channel?.name || "Loading..."}</span>
                </h1>
                {channel?.description && (
                  <>
                    <Separator orientation="vertical" className="h-4" />
                    <span className="text-sm text-muted-foreground">
                      {channel.description}
                    </span>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Message Display Area */}
        <MessageDisplayArea 
          messages={messages} 
          onReplyClick={(messageId) => setThreadMessageId(messageId)}
        />

        {/* MessageInput */}
        <MessageInput 
          channelId={parseInt(channelId)}
          workspaceId={parseInt(workspaceId)}
        />
      </div>

      {/* ThreadViewer */}
      {threadMessageId && (
        <ThreadViewer
          messageId={threadMessageId}
          channelId={parseInt(channelId)}
          workspaceId={parseInt(workspaceId)}
          onClose={() => setThreadMessageId(null)}
        />
      )}
    </div>
  );
}