import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Check, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector, useAppDispatch } from "@/store";
import { setCurrentWorkspace } from "@/store/workspaceSlice";
import { useLocation } from "wouter";
import { fetchChannels, setCurrentChannel } from "@/store/channelSlice";

interface WorkspaceSwitchDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateNew: () => void;
}

interface Workspace {
  workspaceId: number;
  name: string;
  description: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export function WorkspaceSwitchDialog({ 
  isOpen, 
  onOpenChange,
  onCreateNew 
}: WorkspaceSwitchDialogProps) {
  const dispatch = useAppDispatch();
  const [, setLocation] = useLocation();
  const currentWorkspace = useAppSelector(state => state.workspace.currentWorkspace);

  const { data: workspaces = [], isLoading } = useQuery<Workspace[]>({
    queryKey: ["/api/v1/workspaces"],
    enabled: isOpen,
  });

  const handleSelect = async (workspace: Workspace) => {
    dispatch(setCurrentWorkspace(workspace));
    
    try {
      const channels = await dispatch(fetchChannels({ 
        workspaceId: workspace.workspaceId,
        showArchived: false 
      })).unwrap();
      
      const generalChannel = channels.find(
        channel => channel.name.toLowerCase() === 'general'
      );

      if (generalChannel) {
        dispatch(setCurrentChannel(generalChannel));
        setLocation(`/chat/${workspace.workspaceId}/${generalChannel.channelId}`);
      } else {
        console.warn('No general channel found in workspace:', workspace.name);
        if (channels.length > 0) {
          dispatch(setCurrentChannel(channels[0]));
          setLocation(`/chat/${workspace.workspaceId}/${channels[0].channelId}`);
        }
      }
    } catch (error) {
      console.error('Error switching workspace:', error);
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Switch Workspace</DialogTitle>
          <DialogDescription>
            Select a workspace to switch to or create a new one
          </DialogDescription>
        </DialogHeader>
        <Command className="rounded-lg border shadow-md">
          <CommandInput placeholder="Search workspaces..." />
          <CommandList>
            <CommandEmpty>No workspaces found.</CommandEmpty>
            <CommandGroup heading="Workspaces">
              {workspaces.map((workspace) => (
                <CommandItem
                  key={workspace.workspaceId}
                  onSelect={() => handleSelect(workspace)}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <span>{workspace.name}</span>
                  {currentWorkspace?.workspaceId === workspace.workspaceId && (
                    <Check className="h-4 w-4" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <div className="p-2 border-t">
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "w-full justify-start text-sm",
                "hover:bg-accent hover:text-accent-foreground"
              )}
              onClick={() => {
                onCreateNew();
                onOpenChange(false);
              }}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Create New Workspace
            </Button>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}