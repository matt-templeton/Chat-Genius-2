import { useState, useRef, KeyboardEvent, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Paperclip, Smile } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useToast } from "@/hooks/use-toast";

interface MessageInputProps {
  channelId: number;
  workspaceId: number;
}

export function MessageInput({ channelId, workspaceId }: MessageInputProps) {
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { send } = useWebSocket({
    workspaceId,
    onMessageEvent: (event) => {
      // Handle incoming message events
      if (event.type === "MESSAGE_CREATED" && event.data.channelId === channelId) {
        // Invalidate the messages query to refresh the message list
        queryClient.invalidateQueries({ queryKey: [`/api/v1/channels/${channelId}/messages`] });
      }
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      // Send message through REST API
      const response = await fetch(`/api/v1/channels/${channelId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const data = await response.json();

      // Broadcast message through WebSocket
      send({
        type: "MESSAGE_CREATED",
        data: {
          channelId,
          ...data,
        },
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/v1/channels/${channelId}/messages`] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
      console.error("Failed to send message:", error);
    },
  });

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    try {
      await sendMessageMutation.mutateAsync(message);
      setMessage("");
    } catch (error) {
      console.error("Failed to send message:", error);
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
          disabled={sendMessageMutation.isPending}
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
            disabled={!message.trim() || sendMessageMutation.isPending}
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}