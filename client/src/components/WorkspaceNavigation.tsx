import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Menu, Loader2 } from 'lucide-react';
import { fetchWorkspaces, createWorkspace, setCurrentWorkspace, type Workspace } from '@/store/workspaceSlice';
import type { RootState } from '@/store';
import { useAppDispatch } from '@/store';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useToast } from '@/hooks/use-toast';

const createWorkspaceSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').max(50, 'Name is too long'),
});

type CreateWorkspaceForm = z.infer<typeof createWorkspaceSchema>;

export function WorkspaceNavigation() {
  const dispatch = useAppDispatch();
  const { workspaces, currentWorkspace, loading, error } = useSelector(
    (state: RootState) => state.workspace
  );
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<CreateWorkspaceForm>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: {
      name: '',
    },
  });

  useEffect(() => {
    const loadWorkspaces = async () => {
      try {
        await dispatch(fetchWorkspaces()).unwrap();
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to load workspaces",
          variant: "destructive",
        });
      }
    };

    loadWorkspaces();
  }, [dispatch, toast]);

  const handleCreateWorkspace = async (data: CreateWorkspaceForm) => {
    try {
      await dispatch(createWorkspace(data)).unwrap();
      setCreateDialogOpen(false);
      form.reset();
      toast({
        title: "Success",
        description: "Workspace created successfully",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to create workspace",
        variant: "destructive",
      });
    }
  };

  const handleSelectWorkspace = (workspace: Workspace) => {
    dispatch(setCurrentWorkspace(workspace));
  };

  const WorkspaceList = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="px-4 py-2 text-destructive">
          {error}
        </div>
      );
    }

    if (!workspaces || workspaces.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
          <p className="text-sm text-muted-foreground mb-4">No workspaces found</p>
          <Button onClick={() => setCreateDialogOpen(true)} variant="outline" size="sm">
            Create your first workspace
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-1 p-2">
        {workspaces.map((workspace) => (
          <Button
            key={`workspace-${workspace.workspaceId}`}
            onClick={() => handleSelectWorkspace(workspace)}
            variant={currentWorkspace?.workspaceId === workspace.workspaceId ? "secondary" : "ghost"}
            className="w-full justify-start font-normal"
          >
            {workspace.name}
            {workspace.archived && (
              <span className="ml-2 text-xs text-muted-foreground">(Archived)</span>
            )}
          </Button>
        ))}
      </div>
    );
  };

  return (
    <>
      {/* Mobile Navigation */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden absolute top-4 left-4">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-64">
          <div className="space-y-4 py-4">
            <div className="px-3 py-2">
              <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
                Workspaces
              </h2>
            </div>
            <ScrollArea className="h-[calc(100vh-8rem)]">
              <WorkspaceList />
            </ScrollArea>
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop Navigation */}
      <div className="hidden md:block h-full">
        <div className="space-y-4 py-4">
          <div className="px-3 py-2">
            <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
              Workspaces
            </h2>
            <Button
              onClick={() => setCreateDialogOpen(true)}
              className="w-full justify-start"
              variant="ghost"
              disabled={loading}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Workspace
            </Button>
          </div>
          <ScrollArea className="h-[calc(100vh-8rem)]">
            <WorkspaceList />
          </ScrollArea>
        </div>
      </div>

      {/* Create Workspace Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Workspace</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleCreateWorkspace)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Workspace Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter workspace name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create'
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default WorkspaceNavigation;