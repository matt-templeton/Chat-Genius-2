import { useState, useRef, KeyboardEvent, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Paperclip, Smile, X, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAppSelector } from "@/store";
import { Message } from "@/types/message";
import { cn } from "@/lib/utils";

interface MessageInputProps {
  channelId: number;
  workspaceId: number;
  parentMessageId?: number;
}

interface FilePreview {
  name: string;
  size: number;
  file: File;
}

export function MessageInput({ channelId, workspaceId, parentMessageId }: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FilePreview | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile({
        name: file.name,
        size: file.size,
        file
      });
    }
    // Reset the input value so the same file can be selected again
    e.target.value = '';
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const uploadFile = async (messageId: number) => {
    if (!selectedFile) return;
    console.log(selectedFile)
    const formData = new FormData();
    formData.append('file', selectedFile.file);
    formData.append('workspaceId', workspaceId.toString());
    formData.append('messageId', messageId.toString());

    const token = localStorage.getItem("accessToken");
    try {
      const response = await fetch('/api/v1/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to upload file');
      }

      return await response.json();
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim() && !selectedFile) return;

    try {
      const token = localStorage.getItem("accessToken");
      
      // Create a unique negative ID for the optimistic update
      const tempId = -Date.now();
      
      // Create the message object that will be displayed immediately
      const optimisticMessage: Message = {
        messageId: tempId,
        content: message,
        userId: user!.userId,
        channelId,
        workspaceId,
        parentMessageId,
        hasAttachments: Boolean(selectedFile),
        postedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        replyCount: 0,
        user: {
          userId: user!.userId,
          displayName: user!.displayName,
          profilePicture: user!.profilePicture
        }
      };

      // Immediately update the UI with the new message
      if (parentMessageId) {
        // For thread replies
        await queryClient.setQueryData<Message[]>(
          [`/api/v1/messages/${parentMessageId}/thread`],
          (old = []) => [...old, optimisticMessage]
        );
      } else {
        // For main chat messages
        await queryClient.setQueryData<Message[]>(
          [`/api/v1/channels/${channelId}/messages`],
          (old = []) => [...old, optimisticMessage]
        );
      }

      // Small delay to ensure React has processed the optimistic update
      await new Promise(resolve => setTimeout(resolve, 0));

      // Send the message to the server
      const response = await fetch(`/api/v1/channels/${channelId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: message,
          parentMessageId,
          hasAttachments: Boolean(selectedFile),
          identifier: tempId
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const serverMessage = await response.json();

      // Dispatch optimistic message event with both IDs
      window.dispatchEvent(new CustomEvent('optimistic-message', {
        detail: { 
          messageId: serverMessage.messageId,
          identifier: tempId
        }
      }));

      // If there's a file to upload, do it now
      if (selectedFile) {
        try {
          await uploadFile(serverMessage.messageId);
        } catch (error) {
          toast({
            title: "Error",
            description: "Failed to upload file, but message was sent",
            variant: "destructive",
          });
        }
      }

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
      setSelectedFile(null);
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
      {/* File Preview */}
      {selectedFile && (
        <div className="mb-2 p-2 bg-accent/10 rounded-md flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Paperclip className="h-4 w-4" />
            <span className="font-medium">{selectedFile.name}</span>
            <span className="text-muted-foreground">({formatFileSize(selectedFile.size)})</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleRemoveFile}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

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
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleFileClick}
          >
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
            disabled={!message.trim() && !selectedFile}
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}