import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Menu } from 'lucide-react';
import { fetchWorkspaces, createWorkspace, setCurrentWorkspace } from '@/store/workspaceSlice';
import type { RootState, AppDispatch } from '@/store';
import { useAppDispatch } from '@/store';

interface Workspace {
  id: number;
  name: string;
  archived: boolean;
}

export function WorkspaceNavigation() {
  const dispatch = useAppDispatch();
  const { workspaces, currentWorkspace, loading, error } = useSelector(
    (state: RootState) => state.workspace
  );

  useEffect(() => {
    dispatch(fetchWorkspaces());
  }, [dispatch]);

  const handleCreateWorkspace = async () => {
    try {
      await dispatch(createWorkspace({ name: 'New Workspace' }));
    } catch (err) {
      console.error('Failed to create workspace:', err);
    }
  };

  const handleSelectWorkspace = (workspace: Workspace) => {
    dispatch(setCurrentWorkspace(workspace));
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0">
        <div className="space-y-4 py-4">
          <div className="px-3 py-2">
            <h2 className="mb-2 px-4 text-lg font-semibold">Workspaces</h2>
            <Button
              onClick={handleCreateWorkspace}
              className="w-full justify-start"
              variant="ghost"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Workspace
            </Button>
          </div>
          <ScrollArea className="h-[calc(100vh-8rem)]">
            <div className="space-y-1 p-2">
              {loading && <div className="px-4 py-2">Loading workspaces...</div>}
              {error && <div className="px-4 py-2 text-red-500">{error}</div>}
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
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default WorkspaceNavigation;