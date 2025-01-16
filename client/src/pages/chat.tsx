import { useAppSelector } from "@/store";
import { useLocation } from "wouter";
import { useEffect, useCallback } from "react";
import { Toolbar } from "@/components/Toolbar";
import { WorkspaceNavigationToolbar } from "@/components/WorkspaceNavigationToolbar";
import { ChatsSidebar } from "@/components/ChatsSidebar";
import { ChatArea } from "@/components/ChatArea";
import { useWebSocket } from "@/hooks/useWebSocket";
import { WebSocketMessageEvent, WebSocketChannelEvent, WebSocketReactionEvent } from '@/types/websocket';

export default function ChatPage() {
  const { isAuthenticated, loading } = useAppSelector((state) => state.auth);
  const currentWorkspace = useAppSelector((state) => state.workspace.currentWorkspace);
  const [, setLocation] = useLocation();

  // Define all WebSocket event handlers at the top level
  const handleMessageEvent = useCallback((event: WebSocketMessageEvent) => {
    // This will be distributed to child components through props
    window.dispatchEvent(new CustomEvent('ws-message', { detail: event }));
  }, []);

  const handleChannelEvent = useCallback((event: WebSocketChannelEvent) => {
    window.dispatchEvent(new CustomEvent('ws-channel', { detail: event }));
  }, []);

  const handleReactionEvent = useCallback((event: WebSocketReactionEvent) => {
    window.dispatchEvent(new CustomEvent('ws-reaction', { detail: event }));
  }, []);

  // Single WebSocket connection for the entire chat page
  useWebSocket({
    workspaceId: currentWorkspace?.workspaceId || 0,
    onMessageEvent: handleMessageEvent,
    onChannelEvent: handleChannelEvent,
    onReactionEvent: handleReactionEvent,
  });

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isAuthenticated, loading, setLocation]);

  if (loading || !isAuthenticated) {
    return null;
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Toolbar />
      <div className="flex-1 flex min-h-0">
        <WorkspaceNavigationToolbar />
        <div className="w-64 min-h-0">
          <ChatsSidebar />
        </div>
        <div className="flex-1 min-h-0">
          <ChatArea />
        </div>
      </div>
    </div>
  );
}