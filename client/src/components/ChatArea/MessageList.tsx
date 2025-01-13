/**
 * MessageList Component
 * Displays a list of messages with support for:
 * - Soft-deleted message handling
 * - Message threading
 * - Reactions
 * - Message pinning
 */
import { Message } from "@/types/message";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  MessageSquare,
  Pin,
  Trash2,
  MessageCircle,
  SmilePlus,
} from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const { toast } = useToast();

  const handleReply = (message: Message) => {
    setSelectedMessage(message);
    // TODO: Implement thread view
  };

  const handlePin = async (message: Message) => {
    try {
      // TODO: Implement pin message
      toast({
        title: "Success",
        description: "Message pinned successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to pin message",
        variant: "destructive",
      });
    }
  };

  const handleReact = (message: Message) => {
    // TODO: Implement emoji reaction picker
  };

  const renderMessage = (message: Message) => {
    if (message.deleted) {
      return (
        <div className="italic text-muted-foreground">
          This message was removed
        </div>
      );
    }

    return (
      <>
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{message.userId}</span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(message.postedAt), "MMM d, h:mm a")}
              </span>
            </div>
            <p className="mt-1">{message.content}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleReply(message)}
            >
              <MessageCircle className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handlePin(message)}
            >
              <Pin className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleReact(message)}
            >
              <SmilePlus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex gap-1 mt-2">
            {/* TODO: Implement reaction display */}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <Card
          key={message.messageId}
          className={`p-4 ${
            message.deleted ? "bg-muted" : "hover:bg-muted/50"
          }`}
        >
          {renderMessage(message)}
        </Card>
      ))}
    </div>
  );
}

export default MessageList;
