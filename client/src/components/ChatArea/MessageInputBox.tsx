/**
 * MessageInputBox Component
 * Handles message composition and sending with support for:
 * - Text input
 * - File uploads (to be implemented)
 * - Emoji insertion (to be implemented)
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface MessageInputBoxProps {
  channelId: number;
}

export function MessageInputBox({ channelId }: MessageInputBoxProps) {
  const [content, setContent] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { mutate: sendMessage, isPending } = useMutation({
    mutationFn: async () => {
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

      return response.json();
    },
    onSuccess: () => {
      setContent("");
      queryClient.invalidateQueries({
        queryKey: [`/api/v1/channels/${channelId}/messages`],
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    sendMessage();
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border-t">
      <div className="flex gap-2">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Type a message..."
          className="min-h-[80px]"
        />
        <Button
          type="submit"
          disabled={isPending || !content.trim()}
          className="self-end"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </form>
  );
}

export default MessageInputBox;