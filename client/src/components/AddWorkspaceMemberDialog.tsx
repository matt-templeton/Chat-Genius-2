import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Combobox } from "@/components/ui/combobox";
import { useAppSelector } from "@/store";

const memberSchema = z.object({
  email: z.string().email("Invalid email address"),
});

type FormData = z.infer<typeof memberSchema>;

interface AddWorkspaceMemberDialogProps {
  workspaceId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddWorkspaceMemberDialog({
  workspaceId,
  open,
  onOpenChange,
}: AddWorkspaceMemberDialogProps) {
  const [isAdding, setIsAdding] = useState(false);
  const { toast } = useToast();
  const { currentWorkspace } = useAppSelector((state) => state.workspace);

  const form = useForm<FormData>({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      setIsAdding(true);
      const token = localStorage.getItem('accessToken');
      
      const response = await fetch(`/api/v1/workspaces/${workspaceId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ email: data.email }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        // Handle specific error codes
        switch (responseData.details?.code) {
          case 'EMAIL_NOT_FOUND':
            throw new Error('No user found with this email address');
          case 'ALREADY_MEMBER':
            throw new Error('This user is already a member of the workspace');
          case 'NOT_WORKSPACE_MEMBER':
            throw new Error('You do not have permission to add members to this workspace');
          case 'VALIDATION_ERROR':
            throw new Error('Please enter a valid email address');
          default:
            throw new Error(responseData.details?.message || 'Failed to add member');
        }
      }

      toast({
        title: "Member added",
        description: `Successfully added ${data.email} to the workspace`,
      });

      onOpenChange(false);
      form.reset();
    } catch (error) {
      toast({
        title: "Error adding member",
        description: error instanceof Error ? error.message : "Failed to add member",
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            Add Member to {currentWorkspace?.name || 'Workspace'}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Member Email</FormLabel>
                  <FormControl>
                    <input
                      type="email"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="Enter member's email"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={isAdding}>
                {isAdding ? "Adding..." : "Add Member"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
} 