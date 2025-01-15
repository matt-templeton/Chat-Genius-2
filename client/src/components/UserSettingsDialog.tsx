import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppSelector, useAppDispatch } from "@/store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { updateUserProfile } from "@/store/slices/auth-slice";
import { Loader2, Upload } from "lucide-react";

interface UserSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserSettingsDialog({ open, onOpenChange }: UserSettingsDialogProps) {
  const { user } = useAppSelector((state) => state.auth);
  const { currentWorkspace } = useAppSelector((state) => state.workspace);
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!currentWorkspace?.workspaceId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No workspace selected. Please select a workspace first.",
      });
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('workspaceId', currentWorkspace.workspaceId.toString());

      // First upload the file
      const token = localStorage.getItem("accessToken");
      const fileResponse = await fetch('/api/v1/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (!fileResponse.ok) {
        throw new Error('Failed to upload profile picture');
      }

      const fileData = await fileResponse.json();

      // Then update the user's profile with the new picture URL
      const updateResponse = await fetch('/api/v1/users/profile-picture', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ profilePicture: fileData.fileUrl }),
      });

      if (!updateResponse.ok) {
        throw new Error('Failed to update profile picture');
      }

      const userData = await updateResponse.json();
      dispatch(updateUserProfile(userData));

      toast({
        description: "Profile picture updated successfully",
      });
    } catch (error) {
      console.error('Profile picture update error:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update profile picture",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>User Settings</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* Profile section */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Profile</h3>
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                <AvatarImage src={user?.profilePicture || "/user-avatar.png"} alt={user?.displayName} />
                <AvatarFallback>{user?.displayName?.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="space-y-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileChange}
                />
                <Button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-full"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload Picture
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Recommended: Square image, max 5MB
                </p>
              </div>
            </div>
            <div className="grid grid-cols-[100px_1fr] items-center gap-2">
              <span className="text-sm text-muted-foreground">Display Name</span>
              <span>{user?.displayName}</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] items-center gap-2">
              <span className="text-sm text-muted-foreground">Email</span>
              <span>{user?.email}</span>
            </div>
          </div>

          {/* Preferences section */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Preferences</h3>
            {/* Add preferences options here */}
          </div>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 