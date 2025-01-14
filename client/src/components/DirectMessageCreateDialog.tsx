import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAppDispatch } from "@/store";
import { createDirectMessage } from "@/store/channelSlice";

const dmSchema = z.object({
  participants: z.array(z.string()).min(1, "Select at least one participant"),
});

type FormData = z.infer<typeof dmSchema>;

interface DirectMessageCreateDialogProps {
  workspaceId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDmCreated?: () => void;
}

export function DirectMessageCreateDialog({
  workspaceId,
  open,
  onOpenChange,
  onDmCreated,
}: DirectMessageCreateDialogProps) {
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();
  const dispatch = useAppDispatch();

  const form = useForm<FormData>({
    resolver: zodResolver(dmSchema),
    defaultValues: {
      participants: [],
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      setIsCreating(true);
      await dispatch(createDirectMessage({ 
        workspaceId, 
        participants: data.participants
      })).unwrap();

      toast({
        title: "Direct message created",
        description: "You can now start chatting.",
      });

      onDmCreated?.();
      onOpenChange(false);
      form.reset();
    } catch (error) {
      toast({
        title: "Error creating direct message",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Start a conversation</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="participants"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Select participants</FormLabel>
                  <FormControl>
                    {/* TODO: Add user search and selection component */}
                    <div className="text-sm text-muted-foreground">
                      User selection coming soon...
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? "Creating..." : "Start Chat"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
