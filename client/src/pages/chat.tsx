import { useAppSelector } from "@/store";
import { useLocation } from "wouter";
import { useEffect } from "react";

export default function ChatPage() {
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const { currentWorkspace } = useAppSelector((state) => state.workspace);
  const { currentChannel } = useAppSelector((state) => state.channel);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation("/login");
    }
  }, [isAuthenticated, setLocation]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-8">
      {!currentWorkspace ? (
        <div className="flex items-center justify-center h-full">
          <p className="text-lg text-muted-foreground">
            Select a workspace to start chatting
          </p>
        </div>
      ) : !currentChannel ? (
        <div className="flex items-center justify-center h-full">
          <p className="text-lg text-muted-foreground">
            Select a channel or create a new one
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">
              {currentChannel.name}
            </h1>
          </div>
          <div className="p-4 bg-card rounded shadow">
            Channel content will go here
          </div>
        </div>
      )}
    </div>
  );
}