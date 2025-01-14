import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useAppDispatch } from "@/store";
import { createDirectMessage } from "@/store/channelSlice";
import { Combobox } from "@/components/ui/combobox";

const dmSchema = z.object({
  participant: z.string().min(1, "Select a participant"),
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
  const [members, setMembers] = useState<Array<{ label: string; value: string; userId: number }>>([]);
  const { toast } = useToast();
  const dispatch = useAppDispatch();

  const form = useForm<FormData>({
    resolver: zodResolver(dmSchema),
    defaultValues: {
      participant: "",
    },
  });

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const token = localStorage.getItem('accessToken');
        if (!token) {
          toast({
            title: "Authentication Error",
            description: "Please log in again to continue.",
            variant: "destructive",
          });
          return;
        }

        const response = await fetch(`/api/v1/workspaces/${workspaceId}/members`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.details?.message || 'Failed to fetch workspace members');
        }

        const data = await response.json();
        const currentUser = localStorage.getItem('userId');
        const memberOptions = data
          .filter((member: any) => member.userId.toString() !== currentUser)
          .map((member: any) => ({
            label: member.displayName,
            value: member.displayName,
            userId: member.userId,
          }));

        setMembers(memberOptions);
      } catch (error) {
        toast({
          title: "Error fetching members",
          description: error instanceof Error ? error.message : "Failed to load workspace members",
          variant: "destructive",
        });
      }
    };

    if (open && workspaceId) {
      fetchMembers();
    }
  }, [open, workspaceId, toast]);

  const onSubmit = async (data: FormData) => {
    try {
      setIsCreating(true);
      const selectedMember = members.find(m => m.value === data.participant);

      if (!selectedMember) {
        throw new Error("Selected member not found");
      }

      console.log('Creating DM with member:', {
        displayName: selectedMember.value,
        userId: selectedMember.userId
      });

      const result = await dispatch(createDirectMessage({ 
        workspaceId, 
        participants: [selectedMember.userId]
      })).unwrap();

      console.log('DM creation result:', result);

      toast({
        title: "Direct message created",
        description: `Started a conversation with ${selectedMember.value}`,
      });

      onDmCreated?.();
      onOpenChange(false);
      form.reset();
    } catch (error) {
      console.error('Error creating DM:', error);
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
              name="participant"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Select participant</FormLabel>
                  <FormControl>
                    <Combobox
                      options={members}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="Search members..."
                    />
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