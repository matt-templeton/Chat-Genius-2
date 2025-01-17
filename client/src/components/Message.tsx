import { useState, useEffect, useRef } from "react";
import { MoreHorizontal, SmileIcon, MessageSquare, Loader2, Paperclip, FileIcon, ImageIcon, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Message as MessageType } from "@/types/message";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

interface MessageFile {
  fileId: number;
  filename: string;
  fileType: string;
  fileUrl: string;
}

interface MessageProps {
  message: MessageType;
  userName?: string;
  onReplyClick?: () => void;
  isInThread?: boolean;
  isActiveUser?: boolean;
}

export function Message({ message, onReplyClick, isInThread = false, isActiveUser = false }: MessageProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [selectedImage, setSelectedImage] = useState<MessageFile | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const queryClient = useQueryClient();

  // Fetch files if message has attachments
  const { data: files = [], isLoading: isLoadingFiles } = useQuery<MessageFile[]>({
    queryKey: [`/api/v1/files/message/${message.messageId}`],
    enabled: message.hasAttachments && message.messageId > 0,
  });

  // Get first letter of username for avatar fallback
  const userInitial = message.user?.displayName?.[0]?.toUpperCase() || 'U';
  const displayName = message.user?.displayName || `User ${message.userId}`;

  // Helper function to check if a file is an image
  const isImageFile = (fileType: string) => {
    return fileType.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.gif', '.webp'].some(ext => 
      fileType.toLowerCase().endsWith(ext)
    );
  };

  // Handle clicking outside the image overlay
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (selectedImage && !target.closest('.image-overlay-content')) {
        setSelectedImage(null);
      }
    };

    if (selectedImage) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedImage]);

  // Handle escape key to close overlay
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedImage) {
        setSelectedImage(null);
      }
    };

    if (selectedImage) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [selectedImage]);

  const handleEmojiSelect = async (emoji: any) => {
    try {
      const token = localStorage.getItem('accessToken');
      // Make API call to add reaction
      const response = await fetch(`/api/v1/messages/${message.messageId}/reactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          emojiId: emoji.native
        })
      });

      if (!response.ok) {
        const error = await response.json();
        if (error.details?.code === 'DUPLICATE_REACTION') {
          // If it's a duplicate, we'll just ignore it
          return;
        }
        throw new Error(`Failed to add reaction: ${error.details?.message || 'Unknown error'}`);
      }

      // Update the messages query data to reflect the new reaction
      queryClient.setQueryData<MessageType[]>(
        [`/api/v1/channels/${message.channelId}/messages`],
        (old = []) => old.map(msg => {
          if (msg.messageId === message.messageId) {
            return {
              ...msg,
              reactions: {
                ...(msg.reactions || {}),
                [emoji.native]: ((msg.reactions || {})[emoji.native] || 0) + 1
              }
            };
          }
          return msg;
        })
      );
    } catch (error) {
      console.error('Error adding reaction:', error);
    }
    setShowEmojiPicker(false);
  };

  const handleReactionClick = async (emojiId: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      // Make API call to remove reaction
      const response = await fetch(`/api/v1/messages/${message.messageId}/reactions/${encodeURIComponent(emojiId)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const error = await response.json();
        if (error.details?.code === 'REACTION_NOT_FOUND') {
          return;
        }
        throw new Error(`Failed to remove reaction: ${error.details?.message || 'Unknown error'}`);
      }

      // Update the messages query data to reflect the removed reaction
      queryClient.setQueryData<MessageType[]>(
        [`/api/v1/channels/${message.channelId}/messages`],
        (old = []) => old.map(msg => {
          if (msg.messageId === message.messageId) {
            const reactions = { ...(msg.reactions || {}) };
            if (reactions[emojiId] > 1) {
              reactions[emojiId]--;
            } else {
              delete reactions[emojiId];
            }
            return { ...msg, reactions };
          }
          return msg;
        })
      );
    } catch (error) {
      console.error('Error removing reaction:', error);
    }
  };

  return (
    <>
      <div 
        className={cn(
          "group flex items-start space-x-3 rounded-lg p-1.5 -mx-2 relative",
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
            {message.user?.profilePicture ? (
              <AvatarImage 
                src={message.user.profilePicture} 
                alt={displayName}
              />
            ) : (
              <AvatarFallback>
                {userInitial}
              </AvatarFallback>
            )}
          </Avatar>
        </div>

        {/* Message Content */}
        <div className="min-w-0 flex-1">
          <div className={cn(
            "flex items-center gap-2",
            isActiveUser && "flex-row-reverse"
          )}>
            <span className="font-medium">{displayName}</span>
            <div className={cn(
              "flex items-center gap-2",
              isActiveUser && "flex-row-reverse"
            )}>
              {/* MessageInteractionsToolbar */}
              {isHovered && (
                <div className="flex items-center gap-1">
                  <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                      >
                        <SmileIcon className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Picker
                        data={data}
                        onEmojiSelect={handleEmojiSelect}
                        theme="light"
                        previewPosition="none"
                        skinTonePosition="none"
                      />
                    </PopoverContent>
                  </Popover>
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
              )}
              <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                <span>{new Date(message.postedAt).toLocaleTimeString()}</span>
                {message.messageId < 0 && <Loader2 className="h-3 w-3 animate-spin" />}
              </div>
            </div>
          </div>
          <p className={cn(
            "text-sm mt-1 break-words whitespace-pre-wrap",
            isActiveUser && "text-right"
          )}>{message.content}</p>

          {/* Reactions Display */}
          {message.reactions && Object.keys(message.reactions).length > 0 && (
            <div className={cn(
              "flex flex-wrap gap-1 mt-1",
              isActiveUser && "justify-end"
            )}>
              {Object.entries(message.reactions).map(([emoji, count]) => (
                <button
                  key={emoji}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 hover:bg-accent/20 transition-colors text-sm"
                  onClick={() => handleReactionClick(emoji)}
                >
                  <span>{emoji}</span>
                  <span className="text-xs text-muted-foreground">{count}</span>
                </button>
              ))}
            </div>
          )}

          {/* File Attachments */}
          {message.hasAttachments && (
            <div className={cn(
              "mt-2 space-y-2",
              isActiveUser && "flex flex-col items-end"
            )}>
              {isLoadingFiles || message.messageId < 0 ? (
                <div className={cn(
                  "flex items-center gap-2 text-sm text-muted-foreground",
                  isActiveUser && "flex-row-reverse"
                )}>
                  <Paperclip className="h-4 w-4" />
                  <span>Loading attachments...</span>
                  <Loader2 className="h-3 w-3 animate-spin" />
                </div>
              ) : (
                <div className={cn(
                  "space-y-2",
                  isActiveUser && "flex flex-col items-end"
                )}>
                  {files.map((file) => (
                    <div key={file.fileId} className={cn(
                      "flex items-center gap-2",
                      isActiveUser && "flex-row-reverse"
                    )}>
                      {isImageFile(file.fileType) ? (
                        <div className="relative max-w-sm cursor-pointer" onClick={() => setSelectedImage(file)}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img 
                            src={file.fileUrl} 
                            alt={file.filename}
                            className="rounded-md max-h-48 object-contain hover:opacity-90 transition-opacity"
                          />
                        </div>
                      ) : (
                        <a 
                          href={file.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <FileIcon className="h-4 w-4" />
                          <span>{file.filename}</span>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* RepliesPreview - Only show in main chat area, not in threads */}
          {(message.replyCount ?? 0) > 0 && !isInThread && (
            <div className={cn(
              "mt-2 text-xs text-muted-foreground",
              isActiveUser && "text-right"
            )}>
              <Button variant="ghost" size="sm" className="h-6 px-2" onClick={onReplyClick}>
                <MessageSquare className="h-3 w-3 mr-1" />
                {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Image Overlay */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8">
          <div className="relative max-w-4xl w-full h-full flex items-center justify-center">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-0 right-0 text-white hover:text-white/80 z-10"
              onClick={() => setSelectedImage(null)}
            >
              <X className="h-6 w-6" />
            </Button>
            <div className="image-overlay-content relative max-h-full max-w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedImage.fileUrl}
                alt={selectedImage.filename}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}