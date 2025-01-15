import { useState, useRef, KeyboardEvent, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Paperclip, Smile } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { WebSocketMessageEvent } from "@/types/websocket";
import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAppSelector } from "@/store";
import { Message } from "@/types/message";

interface MessageInputProps {
  channelId: number;
  workspaceId: number;
  parentMessageId?: number;
}

export function MessageInput({ channelId, workspaceId, parentMessageId }: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAppSelector(state => state.auth);

  const handleEmojiSelect = (emoji: any) => {
    const cursorPosition = textareaRef.current?.selectionStart || message.length;
    const newMessage = message.slice(0, cursorPosition) + emoji.native + message.slice(cursorPosition);
    setMessage(newMessage);
    setShowEmojiPicker(false);
    // Focus back on textarea after emoji selection
    textareaRef.current?.focus();
  };

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    try {
      const token = localStorage.getItem("accessToken");
      
      // Create a unique negative ID for the optimistic update
      const tempId = -Date.now();
      
      // Create the message object that will be displayed immediately
      const optimisticMessage: Message = {
        messageId: tempId,
        content: message,
        userId: user!.id,
        channelId,
        workspaceId,
        parentMessageId,
        postedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        user: {
          userId: user!.id,
          displayName: user!.displayName,
          profilePicture: user!.profilePicture
        }
      };

      // Immediately update the UI with the new message
      if (parentMessageId) {
        // For thread replies
        queryClient.setQueryData<Message[]>(
          [`/api/v1/messages/${parentMessageId}/thread`],
          (old = []) => [...old, optimisticMessage]
        );
      } else {
        // For main chat messages
        queryClient.setQueryData<Message[]>(
          [`/api/v1/channels/${channelId}/messages`],
          (old = []) => [...old, optimisticMessage]
        );
      }

      // Send the message to the server
      const response = await fetch(`/api/v1/channels/${channelId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: message,
          parentMessageId
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const serverMessage = await response.json();

      // Update the optimistic message with the real server data
      if (parentMessageId) {
        queryClient.setQueryData<Message[]>(
          [`/api/v1/messages/${parentMessageId}/thread`],
          (old = []) => old.map(msg => 
            msg.messageId === tempId 
              ? {
                  ...msg,
                  messageId: serverMessage.messageId,
                  createdAt: serverMessage.createdAt,
                  updatedAt: serverMessage.updatedAt,
                  postedAt: serverMessage.postedAt
                }
              : msg
          )
        );
      } else {
        queryClient.setQueryData<Message[]>(
          [`/api/v1/channels/${channelId}/messages`],
          (old = []) => old.map(msg => 
            msg.messageId === tempId 
              ? {
                  ...msg,
                  messageId: serverMessage.messageId,
                  createdAt: serverMessage.createdAt,
                  updatedAt: serverMessage.updatedAt,
                  postedAt: serverMessage.postedAt
                }
              : msg
          )
        );
      }

      setMessage("");
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
          placeholder={parentMessageId ? "Reply in thread..." : "Type your message..."}
          className="min-h-[60px] resize-none pr-20"
          rows={1}
        />
        <div className="absolute bottom-2 right-2 flex gap-2">
          <Button variant="ghost" size="icon">
            <Paperclip className="h-4 w-4" />
          </Button>
          <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon">
                <Smile className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Picker
                data={data}
                onEmojiSelect={handleEmojiSelect}
                theme="light"
                previewPosition="none"
                skinTonePosition="none"
              />
            </PopoverContent>
          </Popover>
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