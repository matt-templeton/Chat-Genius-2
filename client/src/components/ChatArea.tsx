import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Separator } from "@/components/ui/separator";
import { Hash } from "lucide-react";
import { useAppSelector } from "@/store";
import { Message, MessageUser } from "@/types/message";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageDisplayArea } from "./MessageDisplayArea";
import { MessageInput } from "./chat/MessageInput";
import { ThreadViewer } from "./ThreadViewer";
import { WebSocketMessageEvent, WebSocketChannelEvent, WebSocketReactionEvent } from "@/types/websocket";
import { format, isToday, isYesterday } from "date-fns";

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

// Helper function to format the date separator label
function getDateSeparatorLabel(date: Date): string {
  if (isToday(date)) {
    return "Today";
  } else if (isYesterday(date)) {
    return "Yesterday";
  }
  return format(date, "MMMM do, yyyy");
}

// Helper function to check if two dates are the same day
function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

// Date separator component
function DateSeparator({ label }: { label: string }) {
  return (
    <div className="relative py-4">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-border"></div>
      </div>
      <div className="relative flex justify-center">
        <span className="bg-background px-2 text-sm text-muted-foreground">
          {label}
        </span>
      </div>
    </div>
  );
}

export function ChatArea() {
  const { workspaceId = "", channelId = "" } = useParams();
  const [realtimeMessages, setRealtimeMessages] = useState<Message[]>([]);
  const queryClient = useQueryClient();
  const { user } = useAppSelector(state => state.auth);
  const [threadMessageId, setThreadMessageId] = useState<number | null>(null);
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const isInitialLoadRef = useRef(true);
  const prevMessagesLengthRef = useRef(0);

  // Add messageIdsRef to track processed messages
  const processedMessageIds = useRef<Set<number>>(new Set());
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
    .filter(msg => !msg.parentMessageId)
    .sort((a, b) => new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime());

  // Handle initial scroll and new messages
  useEffect(() => {
    if (messageContainerRef.current) {
      // On initial load or channel change
      if (isInitialLoadRef.current && messages.length > 0) {
        messageContainerRef.current.scrollTop = messageContainerRef.current.scrollHeight;
        isInitialLoadRef.current = false;
      }
      // On new messages
      else if (messages.length > prevMessagesLengthRef.current) {
        messageContainerRef.current.scrollTop = messageContainerRef.current.scrollHeight;
      }
      prevMessagesLengthRef.current = messages.length;
    }
  }, [messages.length, channelId]);

  // Reset initial load flag when channel changes
  useEffect(() => {
    isInitialLoadRef.current = true;
    prevMessagesLengthRef.current = 0;
  }, [channelId]);

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
      currentUserId: user?.userId,
      identifier: event.data.identifier,
      messageId: event.data.messageId
    });
    console.log("Workspace: ", workspaceId, "Channel: ", channelId )
    
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

      // For messages from other users, proceed with normal handling
      if (event.data.userId !== user?.userId) {
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
        console.log("Added message ID to processed set:", event.data.messageId, "now there are ", processedMessageIds.current.size, "processed messages");
        
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
          hasAttachments: event.data.hasAttachments,
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
  }, [channelId, workspaceId, queryClient, threadMessageId, user]);

  // Handle reaction events
  const handleReactionEvent = useCallback((event: WebSocketReactionEvent) => {
    if (event.data.channelId === parseInt(channelId)) {
      queryClient.setQueryData<Message[]>(
        [`/api/v1/channels/${channelId}/messages`],
        (old = []) => old.map(msg => {
          if (msg.messageId === event.data.messageId) {
            const reactions = { ...(msg.reactions || {}) };
            if (event.type === "REACTION_ADDED") {
              reactions[event.data.emojiId] = event.data.count;
            } else if (event.type === "REACTION_REMOVED") {
              if (event.data.count > 0) {
                reactions[event.data.emojiId] = event.data.count;
              } else {
                delete reactions[event.data.emojiId];
              }
            }
            return { ...msg, reactions };
          }
          return msg;
        })
      );

      // Also update thread messages if we're viewing a thread
      if (threadMessageId) {
        queryClient.setQueryData<Message[]>(
          [`/api/v1/messages/${threadMessageId}/thread`],
          (old = []) => old?.map(msg => {
            if (msg.messageId === event.data.messageId) {
              const reactions = { ...(msg.reactions || {}) };
              if (event.type === "REACTION_ADDED") {
                reactions[event.data.emojiId] = event.data.count;
              } else if (event.type === "REACTION_REMOVED") {
                if (event.data.count > 0) {
                  reactions[event.data.emojiId] = event.data.count;
                } else {
                  delete reactions[event.data.emojiId];
                }
              }
              return { ...msg, reactions };
            }
            return msg;
          }) || []
        );
      }
    }
  }, [channelId, queryClient, threadMessageId]);

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

  const otherParticipants = dmParticipants?.filter(p => p.userId !== user?.userId) || [];
  const otherParticipantsDisplayNames = otherParticipants.map(p => p.displayName).join(', ');
  const firstParticipantInitial = otherParticipantsDisplayNames[0]?.toUpperCase() || '?';

  // Group messages by date
  const messageGroups: { date: Date; messages: Message[] }[] = [];
  messages.forEach((message) => {
    const messageDate = new Date(message.postedAt);
    const lastGroup = messageGroups[messageGroups.length - 1];

    if (lastGroup && isSameDay(lastGroup.date, messageDate)) {
      lastGroup.messages.push(message);
    } else {
      messageGroups.push({
        date: messageDate,
        messages: [message],
      });
    }
  });

  // Remove the useWebSocket call and replace with useEffect
  useEffect(() => {
    const handleMessage = (e: CustomEvent<WebSocketMessageEvent>) => {
      handleMessageEvent(e.detail);
    };

    window.addEventListener('ws-message', handleMessage as EventListener);
    return () => window.removeEventListener('ws-message', handleMessage as EventListener);
  }, [handleMessageEvent]);

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
                  <AvatarImage 
                    src={otherParticipants[0]?.profilePicture || "/user-avatar.png"}
                    alt={otherParticipants[0]?.displayName || "User"}
                  />
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
        <div ref={messageContainerRef} className="flex-1 overflow-y-auto p-4 chat-messages-scroll">
          {messageGroups.map((group, groupIndex) => (
            <div key={group.date.toISOString()}>
              <DateSeparator label={getDateSeparatorLabel(group.date)} />
              {group.messages.map((message) => (
                <MessageDisplayArea
                  key={message.messageId}
                  messages={[message]}
                  onReplyClick={messageId => setThreadMessageId(messageId)}
                />
              ))}
            </div>
          ))}
        </div>

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