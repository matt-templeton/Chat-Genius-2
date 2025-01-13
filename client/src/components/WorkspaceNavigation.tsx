import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Menu, Loader2 } from 'lucide-react';
import { fetchWorkspaces, createWorkspace, setCurrentWorkspace } from '@/store/workspaceSlice';
import type { RootState } from '@/store';
import { useAppDispatch } from '@/store';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

interface Workspace {
  id: number;
  name: string;
  archived: boolean;
}

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

  const form = useForm<CreateWorkspaceForm>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: {
      name: '',
    },
  });

  useEffect(() => {
    dispatch(fetchWorkspaces());
  }, [dispatch]);

  const handleCreateWorkspace = async (data: CreateWorkspaceForm) => {
    try {
      await dispatch(createWorkspace(data)).unwrap();
      setCreateDialogOpen(false);
      form.reset();
    } catch (err) {
      console.error('Failed to create workspace:', err);
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
        <div className="px-4 py-2 text-red-500">
          {error}
        </div>
      );
    }

    if (workspaces.length === 0) {
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
        {workspaces.map((workspace: Workspace) => (
          <Button
            key={workspace.id}
            onClick={() => handleSelectWorkspace(workspace)}
            variant={currentWorkspace?.id === workspace.id ? "secondary" : "ghost"}
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

  const NavigationContent = () => (
    <div className="space-y-4 py-4">
      <div className="px-3 py-2">
        <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">Workspaces</h2>
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
  );

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
          <NavigationContent />
        </SheetContent>
      </Sheet>

      {/* Desktop Navigation */}
      <div className="hidden md:block h-full">
        <NavigationContent />
      </div>

      {/* Create Workspace Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Workspace</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleCreateWorkspace)} className="space-y-4">
            <div>
              <label htmlFor="name" className="text-sm font-medium">
                Workspace Name
              </label>
              <Input
                id="name"
                {...form.register('name')}
                placeholder="Enter workspace name"
                className="mt-1"
              />
              {form.formState.errors.name && (
                <p className="text-sm text-red-500 mt-1">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>
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
        </DialogContent>
      </Dialog>
    </>
  );
}

export default WorkspaceNavigation;