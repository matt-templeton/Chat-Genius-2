import { useAppSelector } from "@/store";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Toolbar } from "@/components/Toolbar";
import { WorkspaceNavigationToolbar } from "@/components/WorkspaceNavigationToolbar";
import { ChatsSidebar } from "@/components/ChatsSidebar";
import { ChatArea } from "@/components/ChatArea";

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
    <div className="h-screen flex flex-col overflow-hidden">
      <Toolbar />
      <div className="flex-1 flex min-h-0">
        <WorkspaceNavigationToolbar />
        <div className="w-64 border-r min-h-0">
          <ChatsSidebar />
        </div>
        <div className="flex-1 min-h-0">
          <ChatArea />
        </div>
      </div>
    </div>
  );
}