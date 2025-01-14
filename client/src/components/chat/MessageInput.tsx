import { useState, useRef, KeyboardEvent, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Paperclip, Smile } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useToast } from "@/hooks/use-toast";
import { useAppDispatch } from "@/store";
import { createMessage } from "@/store/messageSlice";

interface MessageInputProps {
  channelId: number;
  workspaceId: number;
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

export function MessageInput({ channelId, workspaceId }: MessageInputProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const dispatch = useAppDispatch();

  const { send } = useWebSocket({
    workspaceId,
    onMessageEvent: (event: WebSocketMessageEvent) => {
      console.log("MessageInput received event:", event);
      if (event.type === "MESSAGE_CREATED" && event.data.channelId === channelId) {
        console.log("Invalidating messages query for channel:", channelId);
        queryClient.invalidateQueries({ 
          queryKey: [`/api/v1/channels/${channelId}/messages`],
          exact: true 
        });
      }
    },
  });

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    try {
      const result = await dispatch(createMessage({ 
        channelId, 
        content: message 
      })).unwrap();

      setMessage("");

      // Invalidate messages query to refresh the list
      queryClient.invalidateQueries({ queryKey: [`/api/v1/channels/${channelId}/messages`] });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      });
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  useEffect(() => {
    // Focus the textarea when the component mounts
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="p-4 border-t">
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type your message..."
          className="min-h-[60px] resize-none pr-20"
          rows={1}
        />
        <div className="absolute bottom-2 right-2 flex gap-2">
          <Button variant="ghost" size="icon">
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon">
            <Smile className="h-4 w-4" />
          </Button>
          <Button 
            onClick={handleSendMessage} 
            disabled={!message.trim()}
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}