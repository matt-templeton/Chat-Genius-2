import * as z from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAppDispatch } from "@/store";
import { createWorkspace } from "@/store/workspaceSlice";
import { fetchChannels } from "@/store/channelSlice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

const formSchema = z.object({
  name: z.string()
    .min(1, "Workspace name is required")
    .max(50, "Workspace name cannot exceed 50 characters")
    .refine(value => /^[a-zA-Z0-9-_ ]+$/.test(value), {
      message: "Name can only contain letters, numbers, spaces, hyphens and underscores"
    }),
});

interface WorkspaceCreateDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorkspaceCreateDialog({ isOpen, onOpenChange }: WorkspaceCreateDialogProps) {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      const result = await dispatch(createWorkspace({ name: values.name.trim() })).unwrap();
      
      const channels = await dispatch(fetchChannels({ 
        workspaceId: result.workspaceId,
        showArchived: false 
      })).unwrap();

      const generalChannel = channels.find(
        channel => channel.name.toLowerCase() === 'general'
      );

      if (generalChannel) {
        setLocation(`/chat/${result.workspaceId}/${generalChannel.channelId}`);
      } else if (channels.length > 0) {
        setLocation(`/chat/${result.workspaceId}/${channels[0].channelId}`);
      } else {
        setLocation(`/chat/${result.workspaceId}`);
      }

      toast({
        title: "Success",
        description: "Workspace created successfully",
      });
      
      form.reset();
      onOpenChange(false);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create workspace",
      });
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Workspace</DialogTitle>
          <DialogDescription>
            Enter a name for your new workspace. You can add more details later.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="Enter workspace name"
                      autoComplete="off"
                      autoFocus
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  form.reset();
                  onOpenChange(false);
                }}
                disabled={form.formState.isSubmitting}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}