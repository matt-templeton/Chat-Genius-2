import { useAppSelector } from "@/store";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Toolbar } from "@/components/Toolbar";

export default function ChatPage() {
  const { isAuthenticated } = useAppSelector((state) => state.auth);
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
    <div className="h-screen flex flex-col bg-background">
      <Toolbar />
      <div className="flex-1 flex">
        {/* WorkspaceNavigationToolbar */}
        <div className="w-16 border-r bg-sidebar">
          {/* Workspace navigation components will go here */}
        </div>

        {/* ChatsSidebar */}
        <div className="w-64 border-r">
          {/* Chats sidebar components will go here */}
        </div>

        {/* ChatArea */}
        <div className="flex-1">
          {/* Chat area components will go here */}
        </div>
      </div>
    </div>
  );
}