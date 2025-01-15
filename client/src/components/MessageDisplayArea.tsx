import { useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Message as MessageComponent } from "@/components/Message";
import { Message } from "@/types/message";
import { useAppSelector } from "@/store";

interface MessageDisplayAreaProps {
  messages: Message[];
  onReplyClick?: (messageId: number) => void;
  isInThread?: boolean;
}

export function MessageDisplayArea({ messages, onReplyClick, isInThread = false }: MessageDisplayAreaProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAppSelector((state) => state.auth);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-hidden">
      <ScrollArea className="h-full px-4">
        <div className="py-4 space-y-4">
          {messages.map((msg) => (
            <MessageComponent 
              key={msg.messageId} 
              message={msg}
              userName={msg.user?.displayName || `User ${msg.userId}`}
              onReplyClick={onReplyClick ? () => onReplyClick(msg.messageId) : undefined}
              isInThread={isInThread}
              isActiveUser={msg.userId === user?.userId}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
    </div>
  );
} 