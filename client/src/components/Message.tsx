import { useState } from "react";
import { MoreHorizontal, SmileIcon, MessageSquare } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Message as MessageType } from "@/types/message";
import { cn } from "@/lib/utils";

interface MessageProps {
  message: MessageType;
  userName?: string;
}

export function Message({ message }: MessageProps) {
  const [isHovered, setIsHovered] = useState(false);

  // Get first letter of username for avatar fallback
  const userInitial = message.user?.displayName?.[0]?.toUpperCase() || 'U';
  const displayName = message.user?.displayName || `User ${message.userId}`;

  return (
    <div 
      className={cn(
        "group flex items-start space-x-3 rounded-lg p-2 -mx-2 relative",
        "transition-colors duration-200",
        "hover:bg-accent/5"
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
        <div className="flex items-center space-x-2">
          <span className="font-medium">{displayName}</span>
          <span className="text-xs text-muted-foreground">
            {new Date(message.postedAt).toLocaleTimeString()}
          </span>
        </div>
        <p className="text-sm mt-1 break-words">{message.content}</p>

        {/* RepliesPreview - Only show if message has replies */}
        {message.parentMessageId && (
          <div className="mt-2 text-xs text-muted-foreground">
            <Button variant="ghost" size="sm" className="h-6 px-2">
              <MessageSquare className="h-3 w-3 mr-1" />
              View replies
            </Button>
          </div>
        )}
      </div>

      {/* MessageInteractionsToolbar */}
      <div 
        className={cn(
          "absolute right-2 top-2",
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
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
        >
          <MessageSquare className="h-4 w-4" />
        </Button>
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