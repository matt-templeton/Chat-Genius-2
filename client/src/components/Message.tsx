import { useState } from "react";
import { MoreHorizontal, SmileIcon, MessageSquare, Loader2, Paperclip } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Message as MessageType } from "@/types/message";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

interface MessageProps {
  message: MessageType;
  userName?: string;
  onReplyClick?: () => void;
  isInThread?: boolean;
  isActiveUser?: boolean;
}

export function Message({ message, onReplyClick, isInThread = false, isActiveUser = false }: MessageProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Get first letter of username for avatar fallback
  const userInitial = message.user?.displayName?.[0]?.toUpperCase() || 'U';
  const displayName = message.user?.displayName || `User ${message.userId}`;

  // Determine if message is pending (has negative ID)
  const isPending = message.messageId < 0;

  // Fetch thread replies count if this is a parent message and not an optimistic update
  const { data: threadReplies = [] } = useQuery<MessageType[]>({
    queryKey: [`/api/v1/messages/${message.messageId}/thread`],
    enabled: !message.parentMessageId && message.messageId > 0, // Only fetch for parent messages with positive IDs
  });

  const hasReplies = message.parentMessageId || threadReplies.length > 0;
  const replyCount = threadReplies.length;

  return (
    <div 
      className={cn(
        "group flex items-start space-x-3 rounded-lg p-2 -mx-2 relative",
        "transition-colors duration-200",
        "hover:bg-accent/5",
        isActiveUser && "flex-row-reverse space-x-reverse"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* UserIcon with hover state */}
      <div className="relative">
        <Avatar className="w-8 h-8">
          {message.user?.profilePicture && (
            // eslint-disable-next-line @next/next/no-img-element
            <img 
              src={message.user.profilePicture} 
              alt={displayName}
              className="h-full w-full object-cover"
            />
          )}
          <AvatarFallback>
            {userInitial}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Message Content */}
      <div className="min-w-0 flex-1">
        <div className={cn(
          "flex items-center space-x-2",
          isActiveUser && "flex-row-reverse space-x-reverse"
        )}>
          <span className="font-medium">{displayName}</span>
          <div className="flex items-center space-x-1 text-xs text-muted-foreground">
            <span>{new Date(message.postedAt).toLocaleTimeString()}</span>
            {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          </div>
        </div>
        <p className={cn(
          "text-sm mt-1 break-words",
          isActiveUser && "text-right"
        )}>{message.content}</p>

        {/* File Attachment Preview */}
        {message.hasAttachments && (
          <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Paperclip className="h-4 w-4" />
            <span>Attachment</span>
            {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
          </div>
        )}

        {/* RepliesPreview - Only show in main chat area, not in threads */}
        {hasReplies && !isInThread && (
          <div className={cn(
            "mt-2 text-xs text-muted-foreground",
            isActiveUser && "text-right"
          )}>
            <Button variant="ghost" size="sm" className="h-6 px-2" onClick={onReplyClick}>
              <MessageSquare className="h-3 w-3 mr-1" />
              {message.parentMessageId ? "View replies" : `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`}
            </Button>
          </div>
        )}
      </div>

      {/* MessageInteractionsToolbar */}
      <div 
        className={cn(
          "absolute top-2",
          isActiveUser ? "left-2" : "right-2",
          "flex items-center gap-1",
          "opacity-0 transition-opacity duration-200",
          isHovered ? "opacity-100" : "opacity-0"
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
        >
          <SmileIcon className="h-4 w-4" />
        </Button>
        {/* Only show reply button if not in a thread */}
        {!isInThread && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onReplyClick}
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
} 